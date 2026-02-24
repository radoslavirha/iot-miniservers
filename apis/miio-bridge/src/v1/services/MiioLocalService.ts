import { createSocket } from 'dgram';
import { Service, Scope, ProviderScope } from '@tsed/di';
import { IncomingPacket, OutgoingPacket } from '../../global/miio/packet/index.js';

export interface HandshakeResult {
    /** Device ID to use in subsequent commands. */
    deviceId: number;
    /** Current device stamp to use in subsequent commands. */
    stamp: number;
}

/** Default miIO protocol UDP port */
const MIIO_PORT = 54321;

/** UDP handshake timeout in milliseconds */
const MIIO_TIMEOUT_MS = 10000;

@Service()
@Scope(ProviderScope.SINGLETON)
export class MiioLocalService {
    /**
     * Sends a miIO hello packet to the device and returns its deviceId and stamp.
     *
     * @param address IP address of the device.
     */
    async handshake(address: string): Promise<HandshakeResult> {
        const hello = new OutgoingPacket().raw;

        return new Promise<HandshakeResult>((resolve, reject) => {
            const socket = createSocket('udp4');
            let settled = false;

            const done = (err?: Error) => {
                if (settled) return;
                settled = true;
                socket.close();
                if (err) reject(err);
            };

            const timer = setTimeout(() => {
                done(new Error(`Handshake timeout: no response from ${address}:${MIIO_PORT}`));
            }, MIIO_TIMEOUT_MS);

            socket.on('message', (msg) => {
                clearTimeout(timer);
                if (settled) return;
                settled = true;
                socket.close();

                try {
                    const { deviceId, stamp } = IncomingPacket.parseHello(msg);
                    resolve({ deviceId, stamp });
                } catch (err) {
                    reject(err);
                }
            });

            socket.on('error', (err) => {
                clearTimeout(timer);
                done(err);
            });

            socket.send(hello, 0, hello.length, MIIO_PORT, address, (err) => {
                if (err) {
                    clearTimeout(timer);
                    done(err);
                }
            });
        });
    }
}
