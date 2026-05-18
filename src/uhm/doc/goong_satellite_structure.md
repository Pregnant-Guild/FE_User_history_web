# Goong Satellite Structure

Nguồn JSON gốc được tải về tại:

- `FrontEndUser/tmp/goong-styles/goong_satellite.json`

File này là style satellite. Nó vẫn có boundary và labels, nhưng ít lớp nước hơn `goong_map_web.json`.

## Mermaid overview

```mermaid
graph TD
  ROOT[goong_satellite.json]

  ROOT --> S0[source: satellite]
  ROOT --> S1[source: base]
  ROOT --> S2[source: composite]

  S1 --> B1[source-layer: boundary]
  S1 --> B2[source-layer: worldcountriespoints]
  S1 --> B3[source-layer: worldnationalcapitals]

  S2 --> C1[source-layer: vietnam_administrator]
  S2 --> C2[source-layer: streets_label]

  B1 --> BL0[boundary-land-type-0 / type-0-bg]
  B1 --> BL1[boundary-land-type-1 / type-1-bg]
  B1 --> BL2[boundary-land-type-2 / type-2-bg]

  B2 --> PC1[place-country-1]
  B2 --> PC2[place-country-2]

  B3 --> CAP0[place-city-capital]

  C1 --> VA0[place-city-capital-vietnam]
  C1 --> VA1[place-city1 / place-city2]
  C1 --> VA2[place-town1 / place-town2]
  C1 --> VA3[place-suburb / borough / neighbourhood]
  C1 --> VA4[place-village]

  C2 --> RD0[highway-name-minor]
  C2 --> RD1[highway-name-medium]
  C2 --> RD2[highway-name-major]
```

## Boundary layers

Các layer boundary nổi bật:

- `boundary-land-type-0-bg`
- `boundary-land-type-0`
- `boundary-land-type-1-bg`
- `boundary-land-type-1`
- `boundary-land-type-2-bg`
- `boundary-land-type-2`

Minzoom quan sát được:

- `type-0`: từ zoom `1`
- `type-1`: từ zoom `5`
- `type-2-bg`: từ zoom `7`
- `type-2`: từ zoom `7`

## Place labels

Labels hữu ích:

- `place-country-1`
- `place-country-2`
- `place-city-capital`
- `place-city-capital-vietnam`
- `place-city1`
- `place-city2`
- `place-town1`
- `place-town2`

Labels dễ gây rối:

- `highway-name-*`
- `place-suburb*`
- `place-neighbourhood*`
- `place-village`

## Khác biệt thực dụng so với goong_map_web

- Có `source: satellite`
- Boundary vẫn hiện diện rõ
- Labels hành chính vẫn có
- Không lộ ra nhóm water chi tiết rõ như `goong_map_web`
- Phù hợp làm raster/satellite nền hơn là style để dò water layers

## Gợi ý dùng thực tế

- Dùng `goong_satellite.json` cho nền satellite
- Dùng `goong_map_web.json` để dò:
  - water
  - water labels
  - boundary theo cấp
  - labels hành chính
