"use client";

import { MetaNetworkExplorer } from "./MetaNetworkExplorer";

export function MetaNetworkTab() {
  return (
    <MetaNetworkExplorer
      layoutUrl="/api/worlds/layout?recommended_only=true"
      eyebrow="Meta Network"
      title="推薦ワールドの関係を 3D で俯瞰する"
      description="タグの Jaccard 類似度とプラットフォーム一致度を合成し、公開おすすめワールドをメタネットワークとして可視化します。ノードをクリックすると元のワールドを開きます。"
      emptyTitle="公開おすすめワールドがまだありません。"
      emptyHint="まずは Discover からワールドを登録し、おすすめ公開してください。"
      emptyActionHref="/app/discover"
      emptyActionLabel="Discover へ移動"
    />
  );
}
