/**
 * MIoT Property value Interface
 */
export interface MiotPropertyValue {
    value: number;
    description: string;
}

/**
 * MIoT Property Interface
 */
export interface MiotProperty {
    siid: number;
    piid: number;
    access: string[];
    key?: string;
    values: MiotPropertyValue[];
}

/**
 * MIoT Action Interface
 */
export interface MiotAction {
    siid: number;
    aiid: number;
    in?: number[];
    key?: string;
}

/**
 * MIoT Spec Interface
 */
export interface DeviceSpec {
    name: string;
    type: string;
    properties: Map<string, MiotProperty>;
    actions: Map<string, MiotAction>;
}