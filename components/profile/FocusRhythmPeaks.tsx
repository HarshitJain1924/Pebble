import React from "react";
import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";

export interface CognitiveFlowStats {
  morningPct: number;
  afternoonPct: number;
  eveningPct: number;
  peakZone: string;
  icon: string;
}

export interface FocusRhythmPeaksProps {
  cognitiveFlowStats: CognitiveFlowStats;
  colors: any;
  colorScheme: string;
}

export function FocusRhythmPeaks({
  cognitiveFlowStats,
  colors,
  colorScheme,
}: FocusRhythmPeaksProps) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ gap: 2 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: colors.text,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Active Focus Peaks
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted }}>
            Active productivity times calculated from scheduled alarms
          </Text>
        </View>
        <Feather
          name={cognitiveFlowStats.icon as any}
          size={16}
          color={colors.primary}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: 4,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor:
              colorScheme === "light" ? "#F1F5F9" : "#18181B",
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather
            name={cognitiveFlowStats.icon as any}
            size={20}
            color={colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "800",
              color: colors.text,
            }}
          >
            {cognitiveFlowStats.peakZone}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: colors.textMuted,
              marginTop: 1,
            }}
          >
            Most items scheduled in{" "}
            {cognitiveFlowStats.peakZone.toLowerCase().split(" ")[0]}
          </Text>
        </View>
      </View>

      {/* Triple progress bar distribution */}
      <View style={{ gap: 8, marginTop: 6 }}>
        <View style={{ gap: 3 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: colors.textMuted,
              }}
            >
              Morning (5 AM - 12 PM)
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: colors.text,
              }}
            >
              {Math.round(cognitiveFlowStats.morningPct)}%
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor:
                colorScheme === "light" ? "#F1F5F9" : "#18181B",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${cognitiveFlowStats.morningPct}%`,
                backgroundColor: colors.primary,
              }}
            />
          </View>
        </View>

        <View style={{ gap: 3 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: colors.textMuted,
              }}
            >
              Afternoon (12 PM - 5 PM)
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: colors.text,
              }}
            >
              {Math.round(cognitiveFlowStats.afternoonPct)}%
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor:
                colorScheme === "light" ? "#F1F5F9" : "#18181B",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${cognitiveFlowStats.afternoonPct}%`,
                backgroundColor: colors.success,
              }}
            />
          </View>
        </View>

        <View style={{ gap: 3 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: colors.textMuted,
              }}
            >
              Evening/Night (5 PM - 5 AM)
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: colors.text,
              }}
            >
              {Math.round(cognitiveFlowStats.eveningPct)}%
            </Text>
          </View>
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor:
                colorScheme === "light" ? "#F1F5F9" : "#18181B",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${cognitiveFlowStats.eveningPct}%`,
                backgroundColor: "#F59E0B",
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
