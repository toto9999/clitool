import { useNavigate } from "react-router";
import { Button, Title, Text } from "@mantine/core";
import { Home, ArrowLeft } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export function NotFound() {
  const navigate = useNavigate();
  const { colorScheme } = useTheme();

  const bgColor = colorScheme === "dark" ? "#0B0D12" : "#f8f9fa";
  const textColor = colorScheme === "dark" ? "#E8E9ED" : "#212529";
  const mutedColor = colorScheme === "dark" ? "#94A3B8" : "#868e96";

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: bgColor }}
    >
      <div className="text-center space-y-6 max-w-md">
        <div>
          <Title
            order={1}
            style={{
              color: textColor,
              fontSize: "72px",
              fontWeight: 700,
              marginBottom: "16px",
            }}
          >
            404
          </Title>
          <Title
            order={2}
            style={{
              color: textColor,
              fontSize: "24px",
              fontWeight: 600,
              marginBottom: "12px",
            }}
          >
            Page Not Found
          </Title>
          <Text size="md" style={{ color: mutedColor, lineHeight: 1.6 }}>
            The page you're looking for doesn't exist or has been moved.
          </Text>
        </div>

        <div className="flex gap-3 justify-center">
          <Button
            leftSection={<ArrowLeft size={16} />}
            variant="light"
            size="md"
            onClick={() => navigate(-1)}
          >
            Go Back
          </Button>
          <Button
            leftSection={<Home size={16} />}
            variant="filled"
            size="md"
            onClick={() => navigate("/")}
          >
            Go Home
          </Button>
        </div>
      </div>
    </div>
  );
}
