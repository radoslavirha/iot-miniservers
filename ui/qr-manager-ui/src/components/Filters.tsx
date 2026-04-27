import type { QrCodeListFilter, QrType } from '../api/types.js';
import { QR_TYPES } from '../api/types.js';

interface Props {
    value: QrCodeListFilter;
    onChange: (next: QrCodeListFilter) => void;
}

export const Filters = ({ value, onChange }: Props) => (
    <fieldset className="filters">
        <legend>Filters</legend>
        <label>
            Type
            <select
                value={value.type ?? ''}
                onChange={e => onChange({ ...value, type: e.target.value === '' ? undefined : (e.target.value as QrType) })}
            >
                <option value="">All</option>
                {QR_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                ))}
            </select>
        </label>
        <label>
            Active
            <select
                value={value.active === undefined ? '' : String(value.active)}
                onChange={e => {
                    if (e.target.value === '') {
                        onChange({ ...value, active: undefined });
                    } else {
                        onChange({ ...value, active: e.target.value === 'true' });
                    }
                }}
            >
                <option value="">All</option>
                <option value="true">Active only</option>
                <option value="false">Inactive only</option>
            </select>
        </label>
    </fieldset>
);
