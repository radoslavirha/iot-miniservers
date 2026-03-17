import { createCipheriv, createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEADER_SIZE } from './Constants.js';
import { MiotTransport } from './MiotTransport.js';

const TOKEN_HEX = '00112233445566778899aabbccddeeff';
const TOKEN_BUF = Buffer.from(TOKEN_HEX, 'hex');
const TOKEN_KEY = createHash('md5').update(TOKEN_BUF).digest();
const TOKEN_IV = createHash('md5').update(TOKEN_KEY).update(TOKEN_BUF).digest();

const DEVICE_ID = 12345;
const STAMP = 500;

const createSocketMock = vi.hoisted(() => vi.fn());

vi.mock('dgram', () => ({
    createSocket: createSocketMock
}));

/** Build a minimal valid hello-response (32 bytes). */
function buildHelloResponse(deviceId: number, stamp: number): Buffer {
    const buf = Buffer.alloc(HEADER_SIZE, 0xff);
    buf.writeUInt16BE(0x2131, 0);
    buf.writeUInt16BE(HEADER_SIZE, 2);
    buf.writeUInt32BE(deviceId, 8);
    buf.writeUInt32BE(stamp, 12);
    return buf;
}

/** Build a valid encrypted miot response packet. */
function buildCommandResponse(payload: Record<string, unknown>): Buffer {
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    const cipher = createCipheriv('aes-128-cbc', TOKEN_KEY, TOKEN_IV);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    const header = Buffer.alloc(HEADER_SIZE);
    header.writeUInt16BE(0x2131, 0);
    header.writeUInt16BE(HEADER_SIZE + encrypted.length, 2);
    header.writeUInt32BE(0, 4);
    header.writeUInt32BE(DEVICE_ID, 8);
    header.writeUInt32BE(STAMP, 12);

    const checksum = createHash('md5')
        .update(header.subarray(0, 16))
        .update(TOKEN_BUF)
        .update(encrypted)
        .digest();
    checksum.copy(header, 16);

    return Buffer.concat([header, encrypted]);
}

/**
 * Creates a mock dgram socket that emits `message` with `response` or emits
 * `error` synchronously inside `send()`, so V8 coverage tracks inner callbacks.
 */
function createMockSocket(response?: Buffer, error?: Error, sendError?: Error): {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
} {
    // Store registered event handlers (event → handler list)
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

    const socket = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
            if (!handlers[event]) {
                handlers[event] = [];
            }
            handlers[event].push(handler);
        }),
        send: vi.fn((_buf: Buffer, _offset: number, _length: number, _port: number, _host: string, cb: (err?: Error) => void) => {
            if (sendError) {
                // Simulate send failure via the send callback
                cb(sendError);
                return;
            }
            // No error in the send callback itself
            cb();
            // Synchronously emit the message or error event so V8 covers the handlers
            if (error) {
                const errorHandlers = handlers['error'];
                if (errorHandlers) {
                    for (const h of errorHandlers) {
                        h(error);
                    }
                }
            } else if (response) {
                const messageHandlers = handlers['message'];
                if (messageHandlers) {
                    for (const h of messageHandlers) {
                        h(response);
                    }
                }
            }
        }),
        close: vi.fn()
    };

    return socket as unknown as {
        send: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
    };
}

/**
 * Creates a mock socket that fires `sendError` via the send callback AND then
 * synchronously emits `lateResponse` as a message, so the message handler's
 * `if (settled) return;` guard fires on the already-settled socket.
 */
function createMockSocketLateMessage(sendError: Error, lateResponse: Buffer): {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
} {
    const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

    const socket = {
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
            if (!handlers[event]) {
                handlers[event] = [];
            }
            handlers[event].push(handler);
        }),
        send: vi.fn((_buf: Buffer, _offset: number, _length: number, _port: number, _host: string, cb: (err?: Error) => void) => {
            // First settle the socket via send error
            cb(sendError);
            // Then emit a late message — the message handler's if(settled) guard should fire
            const messageHandlers = handlers['message'];
            if (messageHandlers) {
                for (const h of messageHandlers) {
                    h(lateResponse);
                }
            }
        }),
        close: vi.fn()
    };

    return socket as unknown as {
        send: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        on: ReturnType<typeof vi.fn>;
    };
}

describe('MiotTransport', () => {
    beforeEach(() => {
        createSocketMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('handshake()', () => {
        it('resolves with deviceId and stamp from hello response', async () => {
            const hello = buildHelloResponse(DEVICE_ID, STAMP);
            createSocketMock.mockReturnValue(createMockSocket(hello));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            const result = await transport.handshake();

            expect(result.deviceId).toBe(DEVICE_ID);
            expect(result.stamp).toBe(STAMP);
        });

        it('rejects if the socket emits an error', async () => {
            createSocketMock.mockReturnValue(createMockSocket(undefined, new Error('Network unreachable')));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.handshake()).rejects.toThrow('Network unreachable');
        });

        it('rejects if the send callback itself returns an error', async () => {
            createSocketMock.mockReturnValue(createMockSocket(undefined, undefined, new Error('Send failed')));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.handshake()).rejects.toThrow('Send failed');
        });

        it('uses custom port when provided', async () => {
            const hello = buildHelloResponse(DEVICE_ID, STAMP);
            const socket = createMockSocket(hello);
            createSocketMock.mockReturnValue(socket);

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX, 12345);
            await transport.handshake();

            // Verify send used the custom port
            const sendArgs = socket.send.mock.calls[0];
            expect(sendArgs[3]).toBe(12345);
        });

        it('rejects with send error even when a late message also arrives (settled guard)', async () => {
            // Fires sendError → settles socket → THEN emits message → message handler if(settled) guard fires
            const hello = buildHelloResponse(DEVICE_ID, STAMP);
            createSocketMock.mockReturnValue(createMockSocketLateMessage(new Error('Send failed'), hello));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.handshake()).rejects.toThrow('Send failed');
        });
    });

    describe('getProperty()', () => {
        it('resolves with the property value on success', async () => {
            const response = buildCommandResponse({
                id: 1,
                result: [{ did: String(DEVICE_ID), siid: 2, piid: 3, value: 42, code: 0 }]
            });
            createSocketMock.mockReturnValue(createMockSocket(response));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            const value = await transport.getProperty(DEVICE_ID, STAMP, 2, 3);

            expect(value).toBe(42);
        });

        it('throws when the device returns a non-zero code', async () => {
            const response = buildCommandResponse({
                id: 1,
                result: [{ did: String(DEVICE_ID), siid: 2, piid: 3, code: -4001 }]
            });
            createSocketMock.mockReturnValue(createMockSocket(response));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.getProperty(DEVICE_ID, STAMP, 2, 3)).rejects.toThrow('get_properties failed');
        });

        it('throws when result is missing', async () => {
            const response = buildCommandResponse({ id: 1, result: [] });
            createSocketMock.mockReturnValue(createMockSocket(response));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.getProperty(DEVICE_ID, STAMP, 2, 3)).rejects.toThrow('get_properties failed');
        });
    });

    describe('getProperties()', () => {
        it('collects all results in a single chunk', async () => {
            const result = [
                { did: String(DEVICE_ID), siid: 2, piid: 1, value: 100, code: 0 },
                { did: String(DEVICE_ID), siid: 2, piid: 2, value: 50, code: 0 }
            ];
            const response = buildCommandResponse({ id: 1, result });
            createSocketMock.mockReturnValue(createMockSocket(response));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            const { results, finalStamp } = await transport.getProperties(
                DEVICE_ID,
                STAMP,
                [{ siid: 2, piid: 1 }, { siid: 2, piid: 2 }]
            );

            expect(results).toHaveLength(2);
            expect(results[0].value).toBe(100);
            expect(results[1].value).toBe(50);
            expect(finalStamp).toBe(STAMP);
        });

        it('issues multiple commands when props exceed maxChunkSize', async () => {
            const makeResponse = (siid: number, piid: number, value: number) =>
                buildCommandResponse({
                    id: 1,
                    result: [{ did: String(DEVICE_ID), siid, piid, value, code: 0 }]
                });

            // Two calls needed for 2 props with maxChunkSize=1
            createSocketMock
                .mockReturnValueOnce(createMockSocket(makeResponse(2, 1, 10)))
                .mockReturnValueOnce(createMockSocket(makeResponse(2, 2, 20)));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            const { results } = await transport.getProperties(
                DEVICE_ID,
                STAMP,
                [{ siid: 2, piid: 1 }, { siid: 2, piid: 2 }],
                1
            );

            expect(results).toHaveLength(2);
            expect(results[0].value).toBe(10);
            expect(results[1].value).toBe(20);
        });

        it('handles null result from device gracefully (covers raw ?? [] fallback)', async () => {
            // When result is null, raw ?? [] uses the [] fallback → empty results array
            const response = buildCommandResponse({ id: 1, result: null });
            createSocketMock.mockReturnValue(createMockSocket(response));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            const { results } = await transport.getProperties(DEVICE_ID, STAMP, [{ siid: 2, piid: 1 }]);
            expect(results).toHaveLength(0);
        });
    });

    describe('setProperty()', () => {
        it('resolves without error on success', async () => {
            const response = buildCommandResponse({
                id: 1,
                result: [{ did: String(DEVICE_ID), siid: 2, piid: 3, code: 0 }]
            });
            createSocketMock.mockReturnValue(createMockSocket(response));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.setProperty(DEVICE_ID, STAMP, 2, 3, 'on')).resolves.toBeUndefined();
        });

        it('throws when device returns non-zero code', async () => {
            const response = buildCommandResponse({
                id: 1,
                result: [{ did: String(DEVICE_ID), siid: 2, piid: 3, code: -70001 }]
            });
            createSocketMock.mockReturnValue(createMockSocket(response));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.setProperty(DEVICE_ID, STAMP, 2, 3, 'on')).rejects.toThrow('set_properties failed');
        });

        it('throws when result array is empty', async () => {
            // Empty result → item = undefined → isNil(item) = true → throw (covers item?.code ?? 'unknown' fallback)
            const response = buildCommandResponse({ id: 1, result: [] });
            createSocketMock.mockReturnValue(createMockSocket(response));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.setProperty(DEVICE_ID, STAMP, 2, 3, 'on')).rejects.toThrow('set_properties failed');
        });
    });

    describe('callAction()', () => {
        it('resolves without error on success', async () => {
            const response = buildCommandResponse({ id: 1, result: 'ok' });
            createSocketMock.mockReturnValue(createMockSocket(response));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.callAction(DEVICE_ID, STAMP, 2, 1)).resolves.toBeUndefined();
        });

        it('wraps scalar arg in an array', async () => {
            const response = buildCommandResponse({ id: 1, result: 'ok' });
            const socket = createMockSocket(response);
            createSocketMock.mockReturnValue(socket);

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await transport.callAction(DEVICE_ID, STAMP, 2, 1, 'start');

            // Verify send was called (arg wrapping validated via OutgoingPacket internal test)
            expect(socket.send).toHaveBeenCalledOnce();
        });

        it('rejects when device returns an error response', async () => {
            const response = buildCommandResponse({
                id: 1,
                error: { code: -9999, message: 'Device error' }
            });
            createSocketMock.mockReturnValue(createMockSocket(response));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.callAction(DEVICE_ID, STAMP, 2, 1)).rejects.toThrow('Device error -9999: Device error');
        });

        it('rejects when send callback returns an error', async () => {
            createSocketMock.mockReturnValue(createMockSocket(undefined, undefined, new Error('UDP send error')));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.callAction(DEVICE_ID, STAMP, 2, 1)).rejects.toThrow('UDP send error');
        });

        it('rejects when socket emits an error event', async () => {
            createSocketMock.mockReturnValue(createMockSocket(undefined, new Error('Socket error')));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.callAction(DEVICE_ID, STAMP, 2, 1)).rejects.toThrow('Socket error');
        });

        it('forwards array args as-is', async () => {
            const response = buildCommandResponse({ id: 1, result: 'ok' });
            const socket = createMockSocket(response);
            createSocketMock.mockReturnValue(socket);

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.callAction(DEVICE_ID, STAMP, 2, 1, [1, 2])).resolves.toBeUndefined();
        });
    });

    describe('sendCommand() — edge cases', () => {
        it('rejects when response JSON is empty (null)', async () => {
            // Build a header-only response (no encrypted body) — IncomingPacket.json returns null
            const headerOnly = Buffer.alloc(HEADER_SIZE, 0xff);
            headerOnly.writeUInt16BE(0x2131, 0);
            headerOnly.writeUInt16BE(HEADER_SIZE, 2);
            createSocketMock.mockReturnValue(createMockSocket(headerOnly));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.callAction(DEVICE_ID, STAMP, 2, 1)).rejects.toThrow('Empty response from device');
        });

        it('settled guard fires when a late message arrives after sendCommand already settled', async () => {
            // sendError settles the socket (done(err) → settled=true), THEN a late message arrives.
            // The message handler's if(settled) return; guard should fire (TRUE branch).
            const lateResponse = buildCommandResponse({ id: 1, result: 'ok' });
            createSocketMock.mockReturnValue(createMockSocketLateMessage(new Error('Send error'), lateResponse));

            const transport = new MiotTransport('192.168.1.1', TOKEN_HEX);
            await expect(transport.callAction(DEVICE_ID, STAMP, 2, 1)).rejects.toThrow('Send error');
        });
    });
});
