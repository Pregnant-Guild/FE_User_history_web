import { useState } from "react";
import {
    BackgroundLayerVisibility,
    HIDDEN_BACKGROUND_LAYER_VISIBILITY,
} from "@/uhm/lib/backgroundLayers";

export function useBackgroundSessionState() {
    // Trạng thái bật/tắt layer nền (khởi tạo default hidden; sẽ load từ storage ở page).
    const [backgroundVisibility, setBackgroundVisibility] = useState<BackgroundLayerVisibility>(
        () => ({ ...HIDDEN_BACKGROUND_LAYER_VISIBILITY })
    );
    // Đảm bảo đã load visibility trước khi render map thật.
    const [isBackgroundVisibilityReady, setIsBackgroundVisibilityReady] = useState(false);

    return {
        backgroundVisibility,
        setBackgroundVisibility,
        isBackgroundVisibilityReady,
        setIsBackgroundVisibilityReady,
    };
}
