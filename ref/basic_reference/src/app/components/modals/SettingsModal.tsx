import { Modal, Text, SegmentedControl } from "@mantine/core";
import { useTheme } from "../../context/ThemeContext";

interface SettingsModalProps {
  opened: boolean;
  onClose: () => void;
}

export function SettingsModal({ opened, onClose }: SettingsModalProps) {
  const { colorScheme, toggleColorScheme, debugMode, toggleDebugMode } = useTheme();

  const bgColor = colorScheme === "dark" ? "#1a1b1e" : "#ffffff";
  const textColor = colorScheme === "dark" ? "#e3e2e6" : "#212529";
  const mutedColor = colorScheme === "dark" ? "#c0c7d4" : "#868e96";
  const borderColor = colorScheme === "dark" ? "rgba(64,71,82,0.1)" : "#dee2e6";
  const controlBg = colorScheme === "dark" ? "#25262b" : "#f1f3f5";
  const controlActiveBg = colorScheme === "dark" ? "#3b82f6" : "#228be6";
  const controlActiveText = "#ffffff";
  const controlInactiveText = colorScheme === "dark" ? "#c0c7d4" : "#495057";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={600} style={{ color: textColor, fontSize: "16px" }}>
          설정
        </Text>
      }
      size="md"
      styles={{
        content: {
          backgroundColor: bgColor,
        },
        header: {
          backgroundColor: bgColor,
          borderBottom: `1px solid ${borderColor}`,
        },
        body: {
          padding: "20px",
        },
      }}
    >
      <div className="space-y-6">
        {/* 테마 설정 */}
        <div>
          <Text fw={500} mb={8} style={{ color: textColor, fontSize: "14px" }}>
            테마
          </Text>
          <Text size="sm" mb={12} style={{ color: mutedColor, fontSize: "12px" }}>
            애플리케이션의 외관을 설정합니다
          </Text>
          <div 
            className="flex gap-2 p-1 rounded-lg"
            style={{ backgroundColor: controlBg }}
          >
            <button
              onClick={() => toggleColorScheme("light")}
              className="flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all"
              style={{
                backgroundColor: colorScheme === "light" ? controlActiveBg : "transparent",
                color: colorScheme === "light" ? controlActiveText : controlInactiveText,
              }}
            >
              라이트
            </button>
            <button
              onClick={() => toggleColorScheme("dark")}
              className="flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all"
              style={{
                backgroundColor: colorScheme === "dark" ? controlActiveBg : "transparent",
                color: colorScheme === "dark" ? controlActiveText : controlInactiveText,
              }}
            >
              다크
            </button>
          </div>
        </div>

        {/* 구분선 */}
        <div style={{ height: "1px", backgroundColor: borderColor }} />

        {/* 디버그 모드 설정 */}
        <div>
          <Text fw={500} mb={8} style={{ color: textColor, fontSize: "14px" }}>
            디버그 모드
          </Text>
          <Text size="sm" mb={12} style={{ color: mutedColor, fontSize: "12px" }}>
            Global CLI 유틸리티 패널 표시
          </Text>
          <div 
            className="flex gap-2 p-1 rounded-lg"
            style={{ backgroundColor: controlBg }}
          >
            <button
              onClick={() => !debugMode && toggleDebugMode()}
              className="flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all"
              style={{
                backgroundColor: debugMode ? controlActiveBg : "transparent",
                color: debugMode ? controlActiveText : controlInactiveText,
              }}
            >
              켜기
            </button>
            <button
              onClick={() => debugMode && toggleDebugMode()}
              className="flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all"
              style={{
                backgroundColor: !debugMode ? controlActiveBg : "transparent",
                color: !debugMode ? controlActiveText : controlInactiveText,
              }}
            >
              끄기
            </button>
          </div>
        </div>

        {/* 구분선 */}
        <div style={{ height: "1px", backgroundColor: borderColor }} />

        {/* 추가 설정 영역 */}
        <div>
          <Text fw={500} mb={8} style={{ color: textColor, fontSize: "14px" }}>
            기타 설정
          </Text>
          <Text size="sm" style={{ color: mutedColor, fontSize: "12px" }}>
            추가 설정이 여기에 표시됩니다
          </Text>
        </div>
      </div>
    </Modal>
  );
}