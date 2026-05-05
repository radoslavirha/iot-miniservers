import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createQrCodesClient } from '../api/qrCodes.js';
import { QR_TYPES, type QrType } from '../api/types.js';
import { useRuntimeConfig } from '../runtime/RuntimeConfigContext.js';

export const QrCodeCreatePage = () => {
    const config = useRuntimeConfig();
    const client = useMemo(() => createQrCodesClient(config.apiBaseURL), [config.apiBaseURL]);
    const navigate = useNavigate();

    const [targetURL, setTargetURL] = useState<string>('');
    const [label, setLabel] = useState<string>('');
    const [type, setType] = useState<QrType>('other');
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const created = await client.create({ targetURL, label, type });
            navigate(`/admin/${created.id}`);
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    };

    return (
        <section className="page page-create">
            <div className="page-header">
                <h1>New QR code</h1>
            </div>
            <form onSubmit={e => void submit(e)}>
                <label>
                    Target URL
                    <input type="url" value={targetURL} onChange={e => setTargetURL(e.target.value)} required />
                </label>
                <label>
                    Label
                    <input type="text" value={label} onChange={e => setLabel(e.target.value)} required />
                </label>
                <label>
                    Type
                    <select value={type} onChange={e => setType(e.target.value as QrType)}>
                        {QR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </label>
                <button type="submit" className="btn" disabled={busy}>Create</button>
            </form>
            {error && <p role="alert">{error}</p>}
        </section>
    );
};
