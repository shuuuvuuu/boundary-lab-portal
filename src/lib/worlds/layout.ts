import { createHash } from "node:crypto";
import type { Platform, WorldLayoutEdge, WorldLayoutNode, WorldLayoutResponse, WorldSummary } from "@/types/worlds";

const PLATFORM_ORDER: Platform[] = ["hubs", "vrchat", "spatial", "other"];
const EDGE_LIMIT_PER_NODE = 5;
const EDGE_THRESHOLD = 0.4;
const TARGET_RADIUS = 9.5;

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

function createDeterministicRandom(seedSource: string) {
  const digest = createHash("sha1").update(seedSource).digest();
  let seed = digest.readUInt32BE(0) ^ digest.readUInt32BE(4);
  if (seed === 0) {
    seed = 0x9e3779b9;
  }

  return () => {
    seed += 0x6d2b79f5;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function buildVectorLength(vector: Vector3) {
  return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
}

function subtractVector(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

function normalizeVector(vector: Vector3) {
  const length = buildVectorLength(vector) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function computeSimilarity(a: WorldSummary, b: WorldSummary) {
  const tagsA = new Set(a.tags);
  const tagsB = new Set(b.tags);
  const union = new Set([...tagsA, ...tagsB]);
  let overlap = 0;

  tagsA.forEach((tag) => {
    if (tagsB.has(tag)) {
      overlap += 1;
    }
  });

  const jaccard = union.size > 0 ? overlap / union.size : 0;
  const platformScore = a.platform === b.platform ? 1 : 0;
  return Number((jaccard * 0.7 + platformScore * 0.3).toFixed(4));
}

function buildInitialPosition(
  world: WorldSummary,
  index: number,
  count: number,
  platformIndex: number,
): Vector3 {
  const random = createDeterministicRandom(world.id);
  const platformAngle = (Math.PI * 2 * platformIndex) / PLATFORM_ORDER.length;
  const platformCenter = {
    x: Math.cos(platformAngle) * 4.8,
    y: Math.sin(platformAngle * 1.3) * 3.2,
    z: Math.sin(platformAngle) * 4.8,
  };

  const ringAngle = (Math.PI * 2 * index) / Math.max(count, 1);
  const ringRadius = 2.4 + random() * 1.4;
  const scatterRadius = 1.1 + random() * 2.1;
  const theta = Math.acos(2 * random() - 1);
  const phi = Math.PI * 2 * random();

  return {
    x:
      platformCenter.x +
      Math.cos(ringAngle) * ringRadius +
      Math.sin(theta) * Math.cos(phi) * scatterRadius,
    y:
      platformCenter.y +
      Math.sin(ringAngle) * ringRadius * 0.7 +
      Math.cos(theta) * scatterRadius,
    z:
      platformCenter.z +
      Math.cos(ringAngle * 1.4) * ringRadius * 0.6 +
      Math.sin(theta) * Math.sin(phi) * scatterRadius,
  };
}

function normalizePositions(positions: Vector3[]) {
  const maxRadius = positions.reduce((max, position) => Math.max(max, buildVectorLength(position)), 0);
  if (maxRadius <= TARGET_RADIUS) {
    return positions;
  }

  const scale = TARGET_RADIUS / maxRadius;
  return positions.map((position) => ({
    x: Number((position.x * scale).toFixed(4)),
    y: Number((position.y * scale).toFixed(4)),
    z: Number((position.z * scale).toFixed(4)),
  }));
}

function relaxPositions(worlds: WorldSummary[], similarityMatrix: number[][]) {
  const grouped = new Map<Platform, WorldSummary[]>();

  worlds.forEach((world) => {
    const bucket = grouped.get(world.platform) ?? [];
    bucket.push(world);
    grouped.set(world.platform, bucket);
  });

  const initialPositions = worlds.map((world) => {
    const group = grouped.get(world.platform) ?? [world];
    const platformIndex = PLATFORM_ORDER.indexOf(world.platform);
    const worldIndex = group.findIndex((item) => item.id === world.id);
    return buildInitialPosition(world, worldIndex, group.length, Math.max(platformIndex, 0));
  });

  const positions = initialPositions.map((position) => ({ ...position }));
  const velocities = initialPositions.map(() => ({ x: 0, y: 0, z: 0 }));

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const forces = positions.map(() => ({ x: 0, y: 0, z: 0 }));

    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        const delta = subtractVector(positions[j], positions[i]);
        const distance = Math.max(buildVectorLength(delta), 0.25);
        const direction = normalizeVector(delta);
        const similarity = similarityMatrix[i][j];
        const desiredDistance = 2 + (1 - similarity) * 5.4;
        const attraction = (distance - desiredDistance) * (0.012 + similarity * 0.02);
        const repulsion = 0.08 / (distance * distance);
        const force = attraction - repulsion;

        forces[i].x += direction.x * force;
        forces[i].y += direction.y * force;
        forces[i].z += direction.z * force;
        forces[j].x -= direction.x * force;
        forces[j].y -= direction.y * force;
        forces[j].z -= direction.z * force;
      }
    }

    for (let index = 0; index < positions.length; index += 1) {
      const anchorDelta = subtractVector(initialPositions[index], positions[index]);
      forces[index].x += anchorDelta.x * 0.028;
      forces[index].y += anchorDelta.y * 0.028;
      forces[index].z += anchorDelta.z * 0.028;

      velocities[index].x = (velocities[index].x + forces[index].x) * 0.86;
      velocities[index].y = (velocities[index].y + forces[index].y) * 0.86;
      velocities[index].z = (velocities[index].z + forces[index].z) * 0.86;

      positions[index].x += velocities[index].x;
      positions[index].y += velocities[index].y;
      positions[index].z += velocities[index].z;
    }
  }

  return normalizePositions(positions);
}

function buildEdges(worlds: WorldSummary[], similarityMatrix: number[][]): WorldLayoutEdge[] {
  const degrees = worlds.map(() => 0);
  const candidates: Array<{ fromIndex: number; toIndex: number; similarity: number }> = [];

  for (let i = 0; i < worlds.length; i += 1) {
    for (let j = i + 1; j < worlds.length; j += 1) {
      const similarity = similarityMatrix[i][j];
      if (similarity > EDGE_THRESHOLD) {
        candidates.push({ fromIndex: i, toIndex: j, similarity });
      }
    }
  }

  candidates.sort((a, b) => b.similarity - a.similarity);

  return candidates.reduce<WorldLayoutEdge[]>((edges, candidate) => {
    if (
      degrees[candidate.fromIndex] >= EDGE_LIMIT_PER_NODE ||
      degrees[candidate.toIndex] >= EDGE_LIMIT_PER_NODE
    ) {
      return edges;
    }

    degrees[candidate.fromIndex] += 1;
    degrees[candidate.toIndex] += 1;
    edges.push({
      from_id: worlds[candidate.fromIndex].id,
      to_id: worlds[candidate.toIndex].id,
      similarity: Number(candidate.similarity.toFixed(4)),
    });
    return edges;
  }, []);
}

export function buildWorldLayout(worlds: WorldSummary[]): WorldLayoutResponse {
  const publicWorlds = worlds.filter((world) => world.recommendation_count >= 1);
  const similarityMatrix = publicWorlds.map((source, sourceIndex) =>
    publicWorlds.map((target, targetIndex) => {
      if (sourceIndex === targetIndex) {
        return 1;
      }

      return computeSimilarity(source, target);
    }),
  );

  const positions = relaxPositions(publicWorlds, similarityMatrix);
  const nodes: WorldLayoutNode[] = publicWorlds.map((world, index) => ({
    id: world.id,
    name: world.name,
    platform: world.platform,
    url: world.url,
    thumbnail_url: world.thumbnail_url,
    description: world.description,
    tags: world.tags,
    added_by_profile: world.added_by_profile,
    average_rating: world.average_rating,
    review_count: world.review_count,
    current_user_visit_count: world.current_user_visit_count,
    current_user_last_visited_at: world.current_user_last_visited_at,
    active_user_count: world.active_user_count,
    present_portal_users: world.present_portal_users,
    collection_ids: world.collection_ids,
    upcoming_event: world.upcoming_event,
    position: positions[index],
  }));

  return {
    nodes,
    edges: buildEdges(publicWorlds, similarityMatrix),
  };
}
