/**
 * DI token for versioned UDP command handlers.
 *
 * Register a handler with `@Injectable({ type: UDPHandlerToken })`.
 * Inject all handlers with `@Inject(UDPHandlerToken) handlers: IUdpVersionHandler[]`.
 */
export const UDPHandlerToken: unique symbol = Symbol('UDPHandlerToken');
