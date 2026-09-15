import { useMemo } from 'react';
import type { BenchAccessResult, NetworkNode, Trail } from '@/types/accessibility';

interface NetworkSchematicProps {
  nodes: NetworkNode[];
  trails: Trail[];
  results: BenchAccessResult[];
}

const KIND_COLOR: Record<NetworkNode['kind'], string> = {
  entrance: '#6B8E5A',
  junction: '#6B5D52',
  bench: '#C17F59',
};

export default function NetworkSchematic({ nodes, trails, results }: NetworkSchematicProps) {
  const layout = useMemo(() => {
    if (nodes.length === 0) return null;
    const lats = nodes.map((n) => n.lat);
    const lngs = nodes.map((n) => n.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const W = 900;
    const H = 360;
    const pad = 46;
    const spanLat = Math.max(maxLat - minLat, 0.0001);
    const spanLng = Math.max(maxLng - minLng, 0.0001);
    const pos = new Map<string, { x: number; y: number }>();
    nodes.forEach((n) => {
      const x = pad + ((n.lng - minLng) / spanLng) * (W - pad * 2);
      const y = H - pad - ((n.lat - minLat) / spanLat) * (H - pad * 2);
      pos.set(n.id, { x, y });
    });
    return { W, H, pos };
  }, [nodes]);

  if (!layout) return null;
  const { W, H, pos } = layout;
  const resultByNode = new Map<string, BenchAccessResult>();
  results.forEach((r) => {
    if (r.nodeId) resultByNode.set(r.nodeId, r);
  });

  return (
    <div className="paper-texture rounded-xl shadow-paper p-3 mb-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px] h-64">
        {/* 步道 */}
        {trails.map((trail) => {
          const a = pos.get(trail.from);
          const b = pos.get(trail.to);
          if (!a || !b) return null;
          return (
            <g key={trail.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#6B5D52"
                strokeOpacity={0.35}
                strokeWidth={Math.max(1, trail.width * 1.2)}
              />
              {trail.direction === 'oneway' && (
                <polygon
                  points="0,-4 8,0 0,4"
                  fill="#C17F59"
                  transform={`translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2}) rotate(${
                    (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
                  })`}
                />
              )}
            </g>
          );
        })}

        {/* 节点 */}
        {nodes.map((node) => {
          const p = pos.get(node.id)!;
          const r = resultByNode.get(node.id);
          const reachColor = r ? (r.reachable ? '#6B8E5A' : '#EF4444') : KIND_COLOR[node.kind];
          const radius = node.kind === 'entrance' ? 8 : node.kind === 'bench' ? 7 : 5;
          return (
            <g key={node.id}>
              <circle cx={p.x} cy={p.y} r={radius} fill={reachColor} stroke="#fff" strokeWidth={2} />
              <text
                x={p.x}
                y={p.y - radius - 5}
                textAnchor="middle"
                fontSize={11}
                fill="#3D352E"
              >
                {node.name.length > 9 ? `${node.name.slice(0, 9)}…` : node.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 px-2 pb-1 text-xs text-ink-light">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLOR.entrance }} />入口
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLOR.junction }} />交汇点
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-moss-green" />可达长椅
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />不可达长椅
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0 bg-ochre border-t-2" />箭头为单向步道
        </span>
      </div>
    </div>
  );
}
