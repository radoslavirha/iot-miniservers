import { useState } from 'react';
import type { Service } from '../types.js';

interface Props {
    svc: Service;
    color: string;
}

export function Tile({ svc, color }: Props) {
    const [imgFailed, setImgFailed] = useState(false);
    const origin = (() => {
        try {
            return new URL(svc.url).origin;
        } catch {
            return null;
        }
    })();

    function handleMouseEnter(e: React.MouseEvent<HTMLAnchorElement>) {
        e.currentTarget.style.borderLeftColor = color;
        e.currentTarget.style.borderLeftWidth = '3px';
    }

    function handleMouseLeave(e: React.MouseEvent<HTMLAnchorElement>) {
        e.currentTarget.style.borderLeftColor = '';
        e.currentTarget.style.borderLeftWidth = '';
    }

    return (
        <a
            className="tile"
            href={svc.url}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="tile-icon">
                {!imgFailed && origin ? (
                    <img src={`${origin}/favicon.ico`} alt="" loading="lazy" onError={() => setImgFailed(true)} />
                ) : (
                    <span className="fallback">{svc.name.slice(0, 3)}</span>
                )}
            </div>
            <div className="tile-info">
                <div className="tile-name">{svc.name}</div>
                <div className="tile-host">{svc.hostname}</div>
            </div>
        </a>
    );
}
