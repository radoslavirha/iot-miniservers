import axios, { type AxiosInstance } from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { BrokenCircuitError, TaskCancelledError } from '@radoslavirha/resilience';
import { beforeEach, describe, expect, it } from 'vitest';
import { attachErrorTranslation } from './attachErrorTranslation.js';

const MockAdapter = AxiosMockAdapter as unknown as new (
    instance: AxiosInstance,
    options?: Record<string, unknown>
) => AxiosMockAdapter;

/** Shape of a Ts.ED exception as these tests assert on it. */
interface CapturedError {
    status: number;
    message: string;
    origin?: { response?: { status?: number } };
}

async function captureError(promise: Promise<unknown>): Promise<CapturedError> {
    let captured: unknown;

    try {
        await promise;
    } catch (error) {
        captured = error;
    }

    if (captured === undefined) {
        throw new Error('Expected the request to reject, but it resolved.');
    }

    return captured as CapturedError;
}

describe('attachErrorTranslation', () => {
    let instance: AxiosInstance;
    let mock: AxiosMockAdapter;

    beforeEach(() => {
        instance = axios.create({ baseURL: 'https://spec.test' });
        attachErrorTranslation(instance, 'spec-api');
        mock = new MockAdapter(instance);
    });

    it('leaves a successful response untouched', async () => {
        expect.assertions(1);
        mock.onGet('/ok').reply(200, { ok: true });

        await expect(instance.get('/ok')).resolves.toMatchObject({ status: 200 });
    });

    it('maps an upstream error status to 502, naming the API', async () => {
        expect.assertions(3);
        mock.onGet('/boom').reply(503);

        const error = await captureError(instance.get('/boom'));

        expect(error.status).toBe(502);
        expect(error.message).toContain('spec-api');
        expect(error.message).toContain('503');
    });

    it('maps an unreachable API to 502', async () => {
        expect.assertions(2);
        mock.onGet('/down').networkError();

        const error = await captureError(instance.get('/down'));

        expect(error.status).toBe(502);
        expect(error.message).toContain('could not be reached');
    });

    it('maps a cancellation or timeout to 504', async () => {
        expect.assertions(2);
        instance.defaults.adapter = () => Promise.reject(new TaskCancelledError());

        const error = await captureError(instance.get('/slow'));

        expect(error.status).toBe(504);
        expect(error.message).toContain('did not respond in time');
    });

    it('maps an open circuit to 503', async () => {
        expect.assertions(2);
        instance.defaults.adapter = () => Promise.reject(new BrokenCircuitError());

        const error = await captureError(instance.get('/anything'));

        expect(error.status).toBe(503);
        expect(error.message).toContain('circuit open');
    });

    it('preserves the original error so callers can inspect the upstream status', async () => {
        expect.assertions(1);
        mock.onGet('/missing').reply(404);

        const error = await captureError(instance.get('/missing'));

        expect(error.origin?.response?.status).toBe(404);
    });
});
