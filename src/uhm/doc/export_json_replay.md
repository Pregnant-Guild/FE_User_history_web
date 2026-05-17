# Replay Export JSON

Tài liệu này mô tả đúng payload mà nút `Export JSON` của replay đang xuất ra hiện tại.

Nguồn thật:

- `src/uhm/components/editor/ReplayTimelineSidebar.tsx`

## 1. Kết luận ngắn

Export hiện tại có dạng:

```json
{
  "exported_at": "2026-05-17T12:34:56.000Z",
  "geometry_id": "geo-main-id",
  "current_replay": { "...": "BattleReplay hiện tại" },
  "snapshot_fragment": {
    "replays": [
      { "...": "chính current_replay" }
    ]
  }
}
```

Trong đó:

- `current_replay` là replay đang edit
- `snapshot_fragment.replays[0]` là cùng replay đó, nhưng đặt vào đúng chỗ trong commit snapshot

## 2. Root payload

```ts
type ReplayExportPayload = {
  exported_at: string;
  geometry_id: string;
  current_replay: BattleReplay;
  snapshot_fragment: {
    replays: BattleReplay[];
  };
};
```

Ý nghĩa:

- `exported_at`
  - timestamp ISO lúc bấm export
  - chỉ để debug
- `geometry_id`
  - copy nhanh từ `current_replay.geometry_id`
- `current_replay`
  - replay draft hiện tại
- `snapshot_fragment`
  - fragment để test replay này nếu đặt vào commit snapshot thật

## 3. Shape của `current_replay`

```ts
type BattleReplay = {
  id: string;
  geometry_id: string;
  target_geometry_ids: string[];
  detail: ReplayStage[];
};
```

Ý nghĩa:

- `geometry_id`
  - MAIN geo của replay
- `id`
  - hiện luôn bằng `geometry_id`
- `target_geometry_ids`
  - toàn bộ geo thuộc replay
  - phần tử đầu nên luôn là MAIN geo
- `detail`
  - stage/step/actions của replay script

## 4. `target_geometry_ids` là gì

Đây là phần thay thế cho `replay_features` cũ.

FE không còn export/persist cả `FeatureCollection` riêng của replay nữa. Thay vào đó chỉ lưu:

- geo MAIN
- các geo được đưa vào replay từ bulk select
- binding của MAIN geo

Khi mở replay, FE sẽ hydrate lại `replayDraft` từ:

- `mainDraft`
- `target_geometry_ids`

## 5. Shape của `detail`

```ts
type ReplayStage = {
  id: number;
  title?: string;
  detail_time_start: string;
  detail_time_stop: string;
  steps: ReplayStep[];
};
```

```ts
type ReplayStep = {
  duration: number;
  use_UI_function: ReplayAction<UIOptionName>[];
  use_map_function: ReplayAction<MapFunctionName>[];
  use_geo_function: ReplayAction<GeoFunctionName>[];
  use_narrow_function: ReplayAction<NarrativeFunctionName>[];
};
```

Ý nghĩa:

- `stage` là cụm lớn theo mốc thời gian hoặc nhịp kể chuyện
- `step` là đơn vị phát nhỏ hơn trong một stage
- `duration` là trọng số thời gian của step
- action hiện tách thành 4 nhóm

## 6. Ví dụ JSON gần thực tế

```json
{
  "exported_at": "2026-05-17T12:34:56.000Z",
  "geometry_id": "019e13ab-4823-76c5-afde-2391c0cf311d",
  "current_replay": {
    "id": "019e13ab-4823-76c5-afde-2391c0cf311d",
    "geometry_id": "019e13ab-4823-76c5-afde-2391c0cf311d",
    "target_geometry_ids": [
      "019e13ab-4823-76c5-afde-2391c0cf311d",
      "019e13ab-6063-713d-a28f-98a1556817a7",
      "019e13ab-5896-713a-111111111111"
    ],
    "detail": [
      {
        "id": 0,
        "title": "Mở đầu chiến dịch",
        "detail_time_start": "1939",
        "detail_time_stop": "1940",
        "steps": [
          {
            "duration": 1000,
            "use_UI_function": [
              {
                "function_name": "timeline",
                "params": [false]
              }
            ],
            "use_map_function": [
              {
                "function_name": "set_time_filter",
                "params": [1939]
              }
            ],
            "use_geo_function": [
              {
                "function_name": "fly_to_geometries",
                "params": [
                  [
                    "019e13ab-4823-76c5-afde-2391c0cf311d",
                    "019e13ab-6063-713d-a28f-98a1556817a7"
                  ]
                ]
              }
            ],
            "use_narrow_function": [
              {
                "function_name": "set_title",
                "params": ["Chiến dịch bắt đầu"]
              }
            ]
          }
        ]
      }
    ]
  },
  "snapshot_fragment": {
    "replays": [
      {
        "id": "019e13ab-4823-76c5-afde-2391c0cf311d",
        "geometry_id": "019e13ab-4823-76c5-afde-2391c0cf311d",
        "target_geometry_ids": [
          "019e13ab-4823-76c5-afde-2391c0cf311d",
          "019e13ab-6063-713d-a28f-98a1556817a7",
          "019e13ab-5896-713a-111111111111"
        ],
        "detail": [
          {
            "id": 0,
            "title": "Mở đầu chiến dịch",
            "detail_time_start": "1939",
            "detail_time_stop": "1940",
            "steps": [
              {
                "duration": 1000,
                "use_UI_function": [
                  {
                    "function_name": "timeline",
                    "params": [false]
                  }
                ],
                "use_map_function": [
                  {
                    "function_name": "set_time_filter",
                    "params": [1939]
                  }
                ],
                "use_geo_function": [
                  {
                    "function_name": "fly_to_geometries",
                    "params": [
                      [
                        "019e13ab-4823-76c5-afde-2391c0cf311d",
                        "019e13ab-6063-713d-a28f-98a1556817a7"
                      ]
                    ]
                  }
                ],
                "use_narrow_function": [
                  {
                    "function_name": "set_title",
                    "params": ["Chiến dịch bắt đầu"]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## 7. Cách đọc file export

Khi nhìn file export:

- nếu cần biết replay bám vào geo nào, xem `geometry_id`
- nếu cần biết replay gồm những geo nào, xem `target_geometry_ids`
- nếu cần biết script sẽ làm gì, xem `detail[].steps[]`
- nếu cần so với commit snapshot, xem `snapshot_fragment.replays`

## 8. Ghi chú quan trọng

- Export hiện tại không còn chứa `replay_features`
- Nếu mở replay cũ từng dùng `replay_features`, FE sẽ migrate sang `target_geometry_ids` trước khi export
- `current_replay` và `snapshot_fragment.replays[0]` hiện vẫn là cùng một replay, chỉ khác góc nhìn
