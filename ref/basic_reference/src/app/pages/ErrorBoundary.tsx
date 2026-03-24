import { useRouteError, useNavigate, isRouteErrorResponse } from "react-router";
import { Button, Title, Text, Card } from "@mantine/core";
import { Home, RefreshCw, AlertTriangle } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { colorScheme } = useTheme();

  const bgColor = colorScheme === "dark" ? "#0B0D12" : "#f8f9fa";
  const cardBg = colorScheme === "dark" ? "rgba(26, 27, 30, 0.8)" : "#ffffff";
  const borderColor = colorScheme === "dark" ? "rgba(64,71,82,0.15)" : "#dee2e6";
  const textColor = colorScheme === "dark" ? "#E8E9ED" : "#212529";
  const mutedColor = colorScheme === "dark" ? "#94A3B8" : "#868e96";

  let errorMessage = "An unexpected error occurred";
  let errorStatus = "Error";

  if (isRouteErrorResponse(error)) {
    errorStatus = `${error.status}`;
    errorMessage = error.statusText || error.data;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: bgColor }}
    >
      <Card
        padding="xl"
        radius="md"
        withBorder
        className="max-w-lg w-full"
        style={{
          backgroundColor: cardBg,
          borderColor: borderColor,
          backdropFilter: "blur(10px)",
        }}
      >
        <div className="text-center space-y-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
            style={{
              backgroundColor: colorScheme === "dark" ? "#DC262620" : "#FEE2E2",
              color: "#DC2626",
            }}
          >
            <AlertTriangle size={32} />
          </div>

          <div>
            <Title
              order={2}
              style={{
                color: textColor,
                fontSize: "24px",
                fontWeight: 600,
                marginBottom: "8px",
              }}
            >
              {errorStatus}
            </Title>
            <Text size="md" style={{ color: mutedColor, lineHeight: 1.6 }}>
              {errorMessage}
            </Text>
          </div>

          <div className="flex gap-3 justify-center pt-4">
            <Button
              leftSection={<RefreshCw size={16} />}
              variant="light"
              size="md"
              onClick={() => window.location.reload()}
            >
              Reload
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
      </Card>
    </div>
  );
}
