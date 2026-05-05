import type { Cluster } from '../types.js';
import { Tile } from './Tile.js';

interface Props {
    cluster: Cluster;
}

export function ClusterSection({ cluster }: Props) {
    return (
        <section className="cluster">
            <div className="cluster-header">
                <span className="cluster-dot" style={{ background: cluster.color }} />
                <span className="cluster-name">
                    {cluster.label} &mdash; {cluster.ip}
                </span>
                <span className="cluster-rule" />
                <span className="cluster-count">{cluster.services.length}</span>
            </div>
            <div className="tiles">
                {cluster.services.map(svc => (
                    <Tile key={svc.hostname} svc={svc} color={cluster.color} />
                ))}
            </div>
        </section>
    );
}
