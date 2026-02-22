export interface MiotSpecInstance {
    model: string;
    version: number;
    type: string;
    ts: number;
}

enum PropertyFormat {
    String = 'string',
    UInt8 = 'uint8',
    UInt16 = 'uint16',
    UInt32 = 'uint32',
    Int8 = 'int8',
    Int16 = 'int16',
    Int32 = 'int32',
    Bool = 'bool'
}

enum PropertyAccess {
    Read = 'read',
    Write = 'write',
    Notify = 'notify'
}

interface MiotSpecServiceProperty {
    iid: number;
    type: string;
    description: string;
    format: PropertyFormat;
    access: PropertyAccess[];
    unit?: string;
    'value-list'?: {
        value: number;
        description: string;
    }[];
    'value-range'?: [number, number, number];
    'gatt-access'?: unknown[];
}

interface MiotSpecServiceAction {
    iid: number;
    type: string;
    description: string;
    in: number[];
    out: number[];
}

interface MiotSpecServiceEvent {
    iid: number;
    type: string;
    description: string;
    arguments: unknown[];
}

interface MiotSpecService {
    iid: number;
    type: string;
    description: string;
    properties?: MiotSpecServiceProperty[];
    actions?: MiotSpecServiceAction[];
    events?: MiotSpecServiceEvent[];
}

export interface MiotSpecInterface {
    type: string;
    description: string;
    services: MiotSpecService[];
}