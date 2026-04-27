import { createSocket, type RemoteInfo, type Socket } from 'dgram';
import { Injectable, Scope, ProviderScope, OnDestroy, OnInit } from '@tsed/di';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';
import { JSONSchemaValidator } from '@radoslavirha/tsed-common';
import { ConfigService } from './ConfigService.js';
import { DeviceCommandService } from './DeviceCommandService.js';
import { CommandRequestModel } from '../models/CommandRequestModel.js';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import { BaseLogger, Logger } from '@radoslavirha/tsed-logger';

/** Maximum number of consecutive socket restarts before giving up. */
const MAX_RESTART_ATTEMPTS = 5;

/** Delay (ms) before attempting to recreate the socket after an error. */
const RESTART_DELAY_MS = 1_000;

/**
 * Listens for incoming UDP command packets on the configured port.
 * Enabled by setting `udp.enabled = true` in server config.
 *
 * On socket-level errors the service automatically recreates the socket
 * up to {@link MAX_RESTART_ATTEMPTS} times with exponential back-off.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class UdpListenerService implements OnInit, OnDestroy {
    private socket: Socket | null = null;
    private restartAttempts = 0;
    private stopped = false;
    private readonly logger: BaseLogger;

    constructor(
        private readonly configService: ConfigService,
        private readonly deviceCommandService: DeviceCommandService,
        logger: Logger
    ) {
        this.logger = logger.child('UDP_LISTENER');
    }

    /**
     * Bind a UDP4 socket on the configured port and start accepting messages.
     * No-op when `udp.enabled` is falsy.
     */
    private start(): void {
        const udpConfig = this.configService.config.udp;

        if (!ObjectUtils.isEnabled(udpConfig)) {
            return;
        }

        this.stopped = false;
        this.restartAttempts = 0;
        this.createSocket(udpConfig.port);
    }

    /**
     * Gracefully close the socket and mark the service as stopped so it
     * will not attempt to restart.
     */
    private stop(): void {
        this.stopped = true;
        this.closeSocket();
        this.logger.info('UDP listener stopped.');
    }

    private createSocket(port: number): void {
        this.socket = createSocket('udp4');

        this.socket.on('message', (msg: Buffer, rinfo: RemoteInfo) => {
            this.handleMessage(msg, rinfo).catch((err: unknown) => {
                this.logger.error('UDP_MESSAGE_UNHANDLED', {
                    error: err instanceof Error ? err.message : String(err)
                });
            });
        });

        this.socket.on('error', (err: Error) => {
            this.logger.error('UDP_SOCKET_ERROR', { message: err.message, stack: err.stack });
            this.restartSocket(port);
        });

        this.socket.bind(port, () => {
            this.restartAttempts = 0;
            this.logger.info('UDP_LISTENER_STARTED', { message: `UDP listener started on port ${port}.` });
        });
    }

    private closeSocket(): void {
        if (CommonUtils.notNil(this.socket)) {
            try {
                this.socket.removeAllListeners();
                this.socket.close();
            } catch {
                // Socket may already be closed — safe to ignore.
            }
            this.socket = null;
        }
    }

    private restartSocket(port: number): void {
        this.closeSocket();

        if (this.stopped) {
            return;
        }

        this.restartAttempts++;

        if (this.restartAttempts > MAX_RESTART_ATTEMPTS) {
            this.logger.error('UDP_RESTART_EXHAUSTED', {
                message: `Exceeded ${MAX_RESTART_ATTEMPTS} restart attempts — UDP listener will not recover.`
            });
            return;
        }

        const delay = RESTART_DELAY_MS * this.restartAttempts;
        this.logger.warn('UDP_RESTARTING', {
            message: `Recreating UDP socket in ${delay}ms (attempt ${this.restartAttempts}/${MAX_RESTART_ATTEMPTS}).`
        });
        setTimeout(() => this.createSocket(port), delay);
    }

    private reply(data: string, rinfo: RemoteInfo): void {
        if (CommonUtils.isNil(this.socket)) {
            return;
        }

        this.socket.send(data, rinfo.port, rinfo.address, (err) => {
            if (CommonUtils.notNil(err)) {
                this.logger.warn('UDP_REPLY_FAILED', {
                    message: `Failed to send UDP response to ${rinfo.address}:${rinfo.port} — ${err.message}`
                });
            }
        });
    }

    private async handleMessage(msg: Buffer, rinfo: RemoteInfo): Promise<void> {
        let payload: unknown;

        this.logger.info(`Received UDP message from ${rinfo.address}:${rinfo.port}. Payload: ${msg.toString('utf8')}`);

        try {
            payload = JSON.parse(msg.toString('utf8'));
        } catch {
            this.logger.warn(`Invalid JSON from ${rinfo.address}:${rinfo.port}.`);
            this.reply('error: Invalid JSON.', rinfo);
            return;
        }

        let request: CommandRequestModel;

        try {
            request = JSONSchemaValidator.validate(CommandRequestModel, payload);
        } catch (error) {
            this.logger.warn(`Validation failed from ${rinfo.address}:${rinfo.port}.`, {
                error
            });
            this.reply(`error: Validation failed. ${this.stringifyError(error)}`, rinfo);
            return;
        }

        try {
            const commandRequest = CommonUtils.buildModelStrict(DeviceCommandRequest, {
                deviceId: request.deviceId,
                command: request.command,
                operation: request.operation,
                value: request.value
            });

            const response = await this.deviceCommandService.execute(commandRequest);

            if (response.operation === DeviceCommandOperation.Action) {
                this.reply('', rinfo);
            } else {
                this.reply(String(response.value ?? ''), rinfo);
            }
        } catch (error) {
            const message = this.stringifyError(error);
            this.logger.error('UDP_COMMAND_FAILED', { message, deviceId: request.deviceId, command: request.command });
            this.reply(`error: ${message}`, rinfo);
        }
    }

    private stringifyError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    }
    
    public async $onInit(): Promise<void> {
        await this.start();
    }

    public async $onDestroy(): Promise<void> {
        await this.stop();
    }
}
