import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MiotDevice } from './MiotDevice.js';
import type { DiscoverResult, GetPropertiesResult, IStampStore, StampState } from './types.js';

// ---------------------------------------------------------------------------
// Mock MiotTransport — use vi.hoisted so mocks are available inside vi.mock()
// ---------------------------------------------------------------------------

const {
    mockHandshake,
    mockGetProperty,
    mockSetProperty,
    mockCallAction,
    mockGetProperties
} = vi.hoisted(() => ({
    mockHandshake: vi.fn<() => Promise<DiscoverResult>>(),
    mockGetProperty: vi.fn<() => Promise<string | number | undefined>>(),
    mockSetProperty: vi.fn<() => Promise<void>>(),
    mockCallAction: vi.fn<() => Promise<void>>(),
    mockGetProperties: vi.fn<() => Promise<{ results: GetPropertiesResult[]; finalStamp: number }>>()
}));

vi.mock('./MiotTransport.js', () => ({
    MiotTransport: vi.fn(function (this: Record<string, unknown>) {
        this.handshake = mockHandshake;
        this.getProperty = mockGetProperty;
        this.setProperty = mockSetProperty;
        this.callAction = mockCallAction;
        this.getProperties = mockGetProperties;
    })
}));

const TOKEN = '00112233445566778899aabbccddeeff';
const DEVICE_ID = 42;
const STAMP = 100;

describe('MiotDevice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockHandshake.mockResolvedValue({ deviceId: DEVICE_ID, stamp: STAMP });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // discover / connect
    // -----------------------------------------------------------------------

    describe('discover()', () => {
        it('calls transport.handshake and returns deviceId + stamp', async () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            const result = await device.discover();

            expect(result.deviceId).toBe(DEVICE_ID);
            expect(result.stamp).toBe(STAMP);
        });

        it('populates deviceId after call', async () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            await device.discover();

            expect(device.deviceId).toBe(DEVICE_ID);
        });

        it('seeds stamp state', async () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            await device.discover();

            const state = device.getStampState();
            expect(state).toBeDefined();
            expect(state!.stamp).toBe(STAMP);
        });

        it('persists stamp to external store if configured', async () => {
            const store: IStampStore = {
                getStamp: vi.fn<() => Promise<StampState | null>>().mockResolvedValue(null),
                setStamp: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
            };
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, stampStore: store });
            await device.discover();

            expect(store.setStamp).toHaveBeenCalledWith(
                expect.objectContaining({ stamp: STAMP })
            );
        });
    });

    describe('connect()', () => {
        it('delegates to discover()', async () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            await device.connect();

            expect(device.deviceId).toBe(DEVICE_ID);
            expect(mockHandshake).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // requireDeviceId guard
    // -----------------------------------------------------------------------

    describe('command methods before connect()', () => {
        it('getProperty throws "Device not connected"', async () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            await expect(device.getProperty(2, 1)).rejects.toThrow('Device not connected');
        });

        it('setProperty throws "Device not connected"', async () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            await expect(device.setProperty(2, 1, 'on')).rejects.toThrow('Device not connected');
        });

        it('callAction throws "Device not connected"', async () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            await expect(device.callAction(2, 1)).rejects.toThrow('Device not connected');
        });

        it('getProperties throws "Device not connected"', async () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            await expect(device.getProperties([{ siid: 2, piid: 1 }])).rejects.toThrow('Device not connected');
        });
    });

    // -----------------------------------------------------------------------
    // getProperty
    // -----------------------------------------------------------------------

    describe('getProperty()', () => {
        it('returns property value', async () => {
            mockGetProperty.mockResolvedValue(42);

            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: DEVICE_ID });
            device.setStampState({ stamp: STAMP, updatedAt: Date.now() });

            const value = await device.getProperty(2, 1);
            expect(value).toBe(42);
        });

        it('increments stamp by 1 before call', async () => {
            mockGetProperty.mockResolvedValue(0);

            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: DEVICE_ID });
            device.setStampState({ stamp: STAMP, updatedAt: Date.now() });

            await device.getProperty(2, 1);
            expect(mockGetProperty).toHaveBeenCalledWith(DEVICE_ID, STAMP + 1, 2, 1);
        });

        it('retries with fresh stamp on failure', async () => {
            // First call fails, second (after handshake) succeeds
            mockGetProperty
                .mockRejectedValueOnce(new Error('Stale stamp'))
                .mockResolvedValueOnce(99);

            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: DEVICE_ID });
            device.setStampState({ stamp: STAMP, updatedAt: Date.now() });

            const value = await device.getProperty(2, 1);
            expect(value).toBe(99);
            expect(mockHandshake).toHaveBeenCalledOnce();
        });

        it('throws when retry also fails', async () => {
            mockGetProperty.mockRejectedValue(new Error('Still failing'));

            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: DEVICE_ID });
            device.setStampState({ stamp: STAMP, updatedAt: Date.now() });

            await expect(device.getProperty(2, 1)).rejects.toThrow('Operation failed after stamp refresh');
        });
    });

    // -----------------------------------------------------------------------
    // setProperty
    // -----------------------------------------------------------------------

    describe('setProperty()', () => {
        it('resolves without error on success', async () => {
            mockSetProperty.mockResolvedValue(undefined);

            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: DEVICE_ID });
            device.setStampState({ stamp: STAMP, updatedAt: Date.now() });

            await expect(device.setProperty(2, 1, 'on')).resolves.toBeUndefined();
        });

        it('forwards args to transport', async () => {
            mockSetProperty.mockResolvedValue(undefined);

            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: DEVICE_ID });
            device.setStampState({ stamp: STAMP, updatedAt: Date.now() });

            await device.setProperty(3, 7, 100);
            expect(mockSetProperty).toHaveBeenCalledWith(DEVICE_ID, STAMP + 1, 3, 7, 100);
        });
    });

    // -----------------------------------------------------------------------
    // callAction
    // -----------------------------------------------------------------------

    describe('callAction()', () => {
        it('resolves without error', async () => {
            mockCallAction.mockResolvedValue(undefined);

            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: DEVICE_ID });
            device.setStampState({ stamp: STAMP, updatedAt: Date.now() });

            await expect(device.callAction(2, 1)).resolves.toBeUndefined();
        });

        it('forwards aiid and optional args', async () => {
            mockCallAction.mockResolvedValue(undefined);

            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: DEVICE_ID });
            device.setStampState({ stamp: STAMP, updatedAt: Date.now() });

            await device.callAction(5, 3, 'start');
            expect(mockCallAction).toHaveBeenCalledWith(DEVICE_ID, STAMP + 1, 5, 3, 'start');
        });
    });

    // -----------------------------------------------------------------------
    // getProperties
    // -----------------------------------------------------------------------

    describe('getProperties()', () => {
        it('returns results array', async () => {
            const results: GetPropertiesResult[] = [
                { siid: 2, piid: 1, value: 10, code: 0 },
                { siid: 2, piid: 2, value: 20, code: 0 }
            ];
            mockGetProperties.mockResolvedValue({ results, finalStamp: STAMP + 1 });

            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: DEVICE_ID });
            device.setStampState({ stamp: STAMP, updatedAt: Date.now() });

            const out = await device.getProperties([{ siid: 2, piid: 1 }, { siid: 2, piid: 2 }]);
            expect(out).toHaveLength(2);
            expect(out[0].value).toBe(10);
        });

        it('uses finalStamp from transport for stamp update', async () => {
            const finalStamp = STAMP + 5;
            mockGetProperties.mockResolvedValue({ results: [], finalStamp });

            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: DEVICE_ID });
            device.setStampState({ stamp: STAMP, updatedAt: Date.now() });

            await device.getProperties([{ siid: 2, piid: 1 }]);

            const state = device.getStampState();
            expect(state!.stamp).toBe(finalStamp);
        });
    });

    // -----------------------------------------------------------------------
    // stamp state management
    // -----------------------------------------------------------------------

    describe('stamp state', () => {
        it('getStampState returns undefined before connect', () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            expect(device.getStampState()).toBeUndefined();
        });

        it('setStampState seeds the internal state', () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            const state: StampState = { stamp: 999, updatedAt: 12345 };
            device.setStampState(state);
            expect(device.getStampState()).toEqual(state);
        });

    });

    // -----------------------------------------------------------------------
    // IStampStore integration
    // -----------------------------------------------------------------------

    describe('IStampStore', () => {
        it('loads stamp from store when no local state exists', async () => {
            const storedState: StampState = { stamp: 200, updatedAt: Date.now() };
            const store: IStampStore = {
                getStamp: vi.fn<() => Promise<StampState | null>>().mockResolvedValue(storedState),
                setStamp: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
            };
            mockGetProperty.mockResolvedValue(1);

            const device = new MiotDevice({
                address: '1.2.3.4',
                token: TOKEN,
                deviceId: DEVICE_ID,
                stampStore: store
            });

            await device.getProperty(2, 1);

            expect(store.getStamp).toHaveBeenCalledOnce();
            expect(mockGetProperty).toHaveBeenCalledWith(DEVICE_ID, storedState.stamp + 1, 2, 1);
        });

        it('falls through to fresh stamp when store returns null', async () => {
            const store: IStampStore = {
                getStamp: vi.fn<() => Promise<StampState | null>>().mockResolvedValue(null),
                setStamp: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
            };
            mockGetProperty.mockResolvedValue(7);

            const device = new MiotDevice({
                address: '1.2.3.4',
                token: TOKEN,
                deviceId: DEVICE_ID,
                stampStore: store
            });
            // No local stampState AND store returns null → should do fresh handshake
            await device.getProperty(2, 1);

            expect(mockHandshake).toHaveBeenCalledOnce();
        });

        it('updates store after successful stamp refresh', async () => {
            const store: IStampStore = {
                getStamp: vi.fn<() => Promise<StampState | null>>().mockResolvedValue(null),
                setStamp: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
            };
            mockGetProperty.mockResolvedValue(5);

            // no local stamp, store returns null → fresh handshake → store.setStamp called
            const device = new MiotDevice({
                address: '1.2.3.4',
                token: TOKEN,
                deviceId: DEVICE_ID,
                stampStore: store
            });

            await device.getProperty(2, 1);

            expect(store.setStamp).toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // deviceId accessor
    // -----------------------------------------------------------------------

    describe('deviceId accessor', () => {
        it('returns undefined before connect', () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            expect(device.deviceId).toBeUndefined();
        });

        it('returns pre-configured deviceId from options', () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN, deviceId: 999 });
            expect(device.deviceId).toBe(999);
        });

        it('returns deviceId after connect', async () => {
            const device = new MiotDevice({ address: '1.2.3.4', token: TOKEN });
            await device.connect();
            expect(device.deviceId).toBe(DEVICE_ID);
        });
    });
});
