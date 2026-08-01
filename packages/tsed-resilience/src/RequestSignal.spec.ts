import { ParamTypes } from '@tsed/platform-params';
import { JsonParameterStore } from '@tsed/schema';
import { describe, expect, it } from 'vitest';
import { RequestSignal } from './RequestSignal.js';
import { RequestSignalPipe } from './RequestSignalPipe.js';

class TestController {
    public handle(@RequestSignal() signal: AbortSignal): AbortSignal {
        return signal;
    }
}

describe('RequestSignal', () => {
    /**
     * The decorator has no runtime behaviour of its own — it wires the parameter
     * to the `$CTX` source and appends the pipe that maps it to a signal. Assert
     * that metadata, since it is what Ts.ED's param pipeline actually reads.
     */
    it('binds the parameter to the request context and the signal pipe', () => {
        const [param] = JsonParameterStore.getParams(TestController, 'handle');

        expect(param.paramType).toBe(ParamTypes.$CTX);
        expect(param.pipes).toContain(RequestSignalPipe);
    });

    it('skips validation and json-mapping for the injected signal', () => {
        const [param] = JsonParameterStore.getParams(TestController, 'handle');

        expect(param.dataPath).toBe('$ctx');
    });
});
