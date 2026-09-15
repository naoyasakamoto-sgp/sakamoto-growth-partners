export const DEMO_PLANS = [
  {
    id: 'PLAN-021', name: 'Loop Laundry 32', concept: '洗濯を短く、家族時間を長くする家',
    price: 33.8, area: 107.4, floors: 2, bedrooms: 3, footprintWidth: 7.2,
    verification: 0.96, priceConfidence: 0.84, styles: ['natural','minimal'],
    scores: { housework:.97, storage:.94, thermal:.91, work:.72, future:.86, family:.91, privacy:.68, outdoor:.52, design:.82 },
    features: ['ランドリーとファミリークロークが近接','回遊動線','パントリー','半個室ワークスペース','ZEH水準想定'],
    tradeoffs: ['独立書斎ではなく半個室','庭を広く取るには敷地条件を選ぶ'],
    relations: { laundryCloset:1, kitchenPantry:1, entranceWash:1, loop:1 }
  },
  {
    id: 'PLAN-014', name: 'Compact Value 30', concept: '必要なものを残し、総額を抑える家',
    price: 30.6, area: 101.8, floors: 2, bedrooms: 3, footprintWidth: 6.7,
    verification: 0.95, priceConfidence: 0.88, styles: ['minimal','modern'],
    scores: { housework:.83, storage:.76, thermal:.87, work:.62, future:.77, family:.86, privacy:.70, outdoor:.55, design:.74 },
    features: ['水回り集約','コンパクトLDK','階段下収納','3LDK','省エネ標準仕様想定'],
    tradeoffs: ['ファミリークロークなし','在宅勤務スペースはLDK隣接'],
    relations: { laundryCloset:.45, kitchenPantry:.5, entranceWash:.7, loop:.35 }
  },
  {
    id: 'PLAN-063', name: 'Comfort Utility 34', concept: '家事と温熱快適性に予算を寄せる家',
    price: 36.4, area: 112.7, floors: 2, bedrooms: 3, footprintWidth: 7.5,
    verification: 0.94, priceConfidence: 0.80, styles: ['natural','hotel'],
    scores: { housework:.99, storage:.96, thermal:.96, work:.78, future:.88, family:.94, privacy:.72, outdoor:.58, design:.87 },
    features: ['独立ランドリー','大型ファミリークローク','洗面脱衣分離','パントリー','高断熱仕様想定'],
    tradeoffs: ['初期費用が高め','延床面積が大きい'],
    relations: { laundryCloset:1, kitchenPantry:1, entranceWash:.8, loop:.9 }
  },
  {
    id: 'PLAN-045', name: 'Focus Work 33', concept: '仕事と暮らしを切り分ける家',
    price: 35.2, area: 109.1, floors: 2, bedrooms: 3, footprintWidth: 7.0,
    verification: 0.93, priceConfidence: 0.83, styles: ['modern','minimal'],
    scores: { housework:.79, storage:.82, thermal:.89, work:.98, future:.84, family:.80, privacy:.94, outdoor:.46, design:.86 },
    features: ['独立書斎','玄関から書斎へ直接アクセス','オンライン会議向け配置','パントリー'],
    tradeoffs: ['洗濯動線は標準的','LDK面積を仕事空間へ配分'],
    relations: { laundryCloset:.55, kitchenPantry:.9, entranceWash:.5, loop:.4 }
  },
  {
    id: 'PLAN-071', name: 'Single Story Flow 31', concept: '将来まで階段に頼らない平屋',
    price: 35.8, area: 103.2, floors: 1, bedrooms: 3, footprintWidth: 10.9,
    verification: 0.91, priceConfidence: 0.78, styles: ['japanese','natural'],
    scores: { housework:.94, storage:.88, thermal:.90, work:.70, future:.99, family:.92, privacy:.74, outdoor:.91, design:.88 },
    features: ['平屋','中庭接続','家事ワンフロア','将来バリアフリー適性','深い軒'],
    tradeoffs: ['広い間口が必要','土地コストの影響を受けやすい'],
    relations: { laundryCloset:.9, kitchenPantry:.8, entranceWash:.7, loop:.85 }
  },
  {
    id: 'PLAN-032', name: 'Family Hub 35', concept: '子どもの気配と家族時間を中心にする家',
    price: 36.0, area: 115.3, floors: 2, bedrooms: 4, footprintWidth: 7.8,
    verification: 0.95, priceConfidence: 0.82, styles: ['natural','warm'],
    scores: { housework:.86, storage:.91, thermal:.89, work:.64, future:.93, family:.99, privacy:.62, outdoor:.70, design:.84 },
    features: ['4LDK','リビング学習','大容量収納','庭接続LDK','可変子ども室'],
    tradeoffs: ['プライバシーより家族接点を重視','延床面積が大きい'],
    relations: { laundryCloset:.78, kitchenPantry:.82, entranceWash:.65, loop:.7 }
  },
  {
    id: 'PLAN-052', name: 'Urban Narrow 29', concept: '狭小地でも暮らしの質を落としにくい家',
    price: 31.9, area: 96.7, floors: 2, bedrooms: 3, footprintWidth: 5.8,
    verification: 0.92, priceConfidence: 0.86, styles: ['modern','hotel'],
    scores: { housework:.76, storage:.71, thermal:.90, work:.75, future:.70, family:.79, privacy:.81, outdoor:.25, design:.91 },
    features: ['狭小地対応','縦方向の抜け','2階LDK','小型書斎','高窓'],
    tradeoffs: ['庭は取りにくい','収納量は控えめ'],
    relations: { laundryCloset:.45, kitchenPantry:.55, entranceWash:.55, loop:.25 }
  },
  {
    id: 'PLAN-088', name: 'Garden Connect 34', concept: '庭とLDKを一つの居場所にする家',
    price: 35.5, area: 111.0, floors: 2, bedrooms: 3, footprintWidth: 8.4,
    verification: 0.90, priceConfidence: 0.79, styles: ['natural','japanese'],
    scores: { housework:.81, storage:.84, thermal:.86, work:.60, future:.82, family:.93, privacy:.67, outdoor:.99, design:.93 },
    features: ['庭接続LDK','土間収納','ウッドデッキ想定','パントリー','大開口'],
    tradeoffs: ['外構費の影響が大きい','日射制御の設計確認が必要'],
    relations: { laundryCloset:.62, kitchenPantry:.9, entranceWash:.45, loop:.55 }
  },
  {
    id: 'PLAN-097', name: 'Private Balance 33', concept: '家族の距離と一人時間を両立する家',
    price: 34.9, area: 108.8, floors: 2, bedrooms: 3, footprintWidth: 7.1,
    verification: 0.94, priceConfidence: 0.85, styles: ['hotel','modern'],
    scores: { housework:.82, storage:.86, thermal:.91, work:.88, future:.85, family:.84, privacy:.97, outdoor:.42, design:.92 },
    features: ['独立書斎','セカンドリビング','主寝室収納','洗面独立','来客動線分離'],
    tradeoffs: ['共有空間はややコンパクト','庭より室内へ面積配分'],
    relations: { laundryCloset:.65, kitchenPantry:.72, entranceWash:.65, loop:.45 }
  },
  {
    id: 'PLAN-104', name: 'Starter 28', concept: '小さく始めて将来の変更余地を残す家',
    price: 28.9, area: 93.5, floors: 2, bedrooms: 2, footprintWidth: 6.2,
    verification: 0.93, priceConfidence: 0.90, styles: ['minimal','natural'],
    scores: { housework:.78, storage:.69, thermal:.86, work:.66, future:.80, family:.68, privacy:.72, outdoor:.48, design:.78 },
    features: ['2LDK','将来間仕切り想定','コンパクト総額','水回り集約'],
    tradeoffs: ['子ども2人以上では再検討が必要','収納量は限定的'],
    relations: { laundryCloset:.5, kitchenPantry:.45, entranceWash:.6, loop:.4 }
  },
  {
    id: 'PLAN-118', name: 'Storage Core 33', concept: '散らかりにくさを家の中心に置く家',
    price: 34.4, area: 109.8, floors: 2, bedrooms: 3, footprintWidth: 7.4,
    verification: 0.95, priceConfidence: 0.82, styles: ['warm','natural'],
    scores: { housework:.91, storage:1.00, thermal:.88, work:.68, future:.87, family:.90, privacy:.69, outdoor:.57, design:.80 },
    features: ['ファミリークローク','玄関土間収納','リビング収納','パントリー','リネン庫'],
    tradeoffs: ['収納へ面積を配分','独立書斎なし'],
    relations: { laundryCloset:.95, kitchenPantry:1, entranceWash:.72, loop:.72 }
  },
  {
    id: 'PLAN-126', name: 'Thermal Compact 31', concept: '面積を抑え、冬の快適性へ投資する家',
    price: 33.1, area: 101.0, floors: 2, bedrooms: 3, footprintWidth: 6.6,
    verification: 0.92, priceConfidence: 0.81, styles: ['minimal','japanese'],
    scores: { housework:.80, storage:.77, thermal:1.00, work:.65, future:.79, family:.82, privacy:.76, outdoor:.40, design:.79 },
    features: ['断熱強化想定','コンパクト形状','温度差を抑えやすいゾーニング','樹脂サッシ想定'],
    tradeoffs: ['大空間LDKではない','屋外との一体感は控えめ'],
    relations: { laundryCloset:.58, kitchenPantry:.62, entranceWash:.8, loop:.42 }
  }
];

export const STYLE_LABELS = {
  natural: 'ナチュラル', minimal: 'ミニマル', modern: 'モダン', hotel: 'ホテルライク', japanese: '和モダン', warm: 'あたたかい'
};
