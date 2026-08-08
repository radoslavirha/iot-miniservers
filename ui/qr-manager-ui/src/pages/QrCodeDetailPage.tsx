import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QrImage } from '../components/QrImage.js';
import { useQrCodesClient } from '../api/useQrCodesClient.js';
import type { QrCode } from '../api/types.js';
import { useRuntimeConfig } from '../runtime/RuntimeConfigContext.js';

export const QrCodeDetailPage = () => {
    const config = useRuntimeConfig();
    const client = useQrCodesClient();
    const { id = '' } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [qrCode, setQrCode] = useState<QrCode | null>(null);
    const [draftTargetURL, setDraftTargetURL] = useState<string>('');
    const [draftLabel, setDraftLabel] = useState<string>('');
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        client.list({})
            .then(list => list.find(q => q.id === id))
            .then(found => {
                if (cancelled) return;
                if (!found) {
                    setError(`QR code ${id} not found.`);
                    return;
                }
                setQrCode(found);
                setDraftTargetURL(found.targetURL);
                setDraftLabel(found.label);
            })
            .catch(err => {
                if (!cancelled) setError((err as Error).message);
            });
        return () => {
            cancelled = true;
        };
    }, [client, id]);

    const save = async () => {
        if (!qrCode) return;
        setBusy(true);
        setError(null);
        try {
            const updated = await client.update(qrCode.id, { targetURL: draftTargetURL, label: draftLabel });
            setQrCode(updated);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const toggleActive = async () => {
        if (!qrCode) return;
        setBusy(true);
        setError(null);
        try {
            const next = qrCode.active ? await client.deactivate(qrCode.id) : await client.activate(qrCode.id);
            setQrCode(next);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const remove = async () => {
        if (!qrCode) return;
        if (!window.confirm(`Delete QR code ${qrCode.slug}? This cannot be undone.`)) return;
        setBusy(true);
        setError(null);
        try {
            await client.remove(qrCode.id);
            navigate('/admin');
        } catch (err) {
            setError((err as Error).message);
            setBusy(false);
        }
    };

    if (error && !qrCode) {
        return <p role="alert">{error}</p>;
    }
    if (!qrCode) {
        return <p role="status">Loading…</p>;
    }

    return (
        <section className="page page-detail">
            <div className="page-header">
                <h1>{qrCode.label}</h1>
                <p><Link to="/admin">← Back to list</Link></p>
            </div>
            <QrImage qrCode={qrCode} apiBaseURL={config.apiBaseURL} />
            <dl className="dl-grid">
                <dt>Slug</dt><dd>{qrCode.slug}</dd>
                <dt>Type</dt><dd>{qrCode.type}</dd>
                <dt>Active</dt><dd>{qrCode.active ? 'yes' : 'no'}</dd>
                <dt>Created</dt><dd>{qrCode.createdAt}</dd>
                <dt>Updated</dt><dd>{qrCode.updatedAt}</dd>
            </dl>
            <form
                onSubmit={e => {
                    e.preventDefault();
                    void save();
                }}
            >
                <label>
                    Target URL
                    <input
                        type="url"
                        value={draftTargetURL}
                        onChange={e => setDraftTargetURL(e.target.value)}
                        required
                    />
                </label>
                <label>
                    Label
                    <input
                        type="text"
                        value={draftLabel}
                        onChange={e => setDraftLabel(e.target.value)}
                        required
                    />
                </label>
                <div className="actions">
                    <button type="submit" className="btn" disabled={busy}>Save</button>
                    <button type="button" className="btn btn--ghost" onClick={() => void toggleActive()} disabled={busy}>
                        {qrCode.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" className="btn btn--danger" onClick={() => void remove()} disabled={busy}>
                        Delete
                    </button>
                </div>
            </form>
            {error && <p role="alert">{error}</p>}
        </section>
    );
};
