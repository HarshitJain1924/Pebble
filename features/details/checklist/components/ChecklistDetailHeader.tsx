import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppText as Text } from "@/shared/components/ui/AppText";
import { Palette } from "@/shared/constants/theme";
import { LiquidGlassSurface } from "@/shared/components/ui/LiquidGlassSurface";

export interface ChecklistDetailHeaderProps {
  isEditing: boolean;
  hasChanges: boolean;
  isLight: boolean;
  colors: any;
  onBack: () => void;
  onSave: () => void;
  onEdit: () => void;
}

export const ChecklistDetailHeader: React.FC<ChecklistDetailHeaderProps> = ({
  isEditing,
  hasChanges,
  isLight,
  colors,
  onBack,
  onSave,
  onEdit,
}) => {
  return (
    <View style={styles.topNavRow}>
      <TouchableOpacity
        onPress={onBack}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={styles.circleBtnTouchable}
      >
        <LiquidGlassSurface
          borderRadius={21}
          style={styles.circleNavBtn}
          tintColor={isLight ? "rgba(0,0,0,0.06)" : "rgba(255, 255, 255, 0.08)"}
        >
          <Feather
            name="arrow-left"
            size={19}
            color={isLight ? colors.text : Palette.white}
          />
        </LiquidGlassSurface>
      </TouchableOpacity>

      {isEditing ? (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
            onSave();
          }}
          style={[
            styles.saveBtn,
            {
              backgroundColor: hasChanges
                ? colors.primary
                : isLight
                  ? "rgba(0,0,0,0.08)"
                  : "rgba(255,255,255,0.12)",
            },
          ]}
          disabled={!hasChanges}
          accessibilityRole="button"
          accessibilityLabel="Save checklist"
        >
          <Text
            style={{
              color: hasChanges ? Palette.white : colors.textMuted,
              fontWeight: "700",
              fontSize: 13,
            }}
          >
            Save
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
            onEdit();
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Edit checklist"
          style={styles.circleBtnTouchable}
        >
          <LiquidGlassSurface
            borderRadius={21}
            style={styles.circleNavBtn}
            tintColor={isLight ? "rgba(0,0,0,0.06)" : "rgba(255, 255, 255, 0.08)"}
          >
            <Feather
              name="edit-2"
              size={17}
              color={isLight ? colors.text : Palette.white}
            />
          </LiquidGlassSurface>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  topNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  circleBtnTouchable: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  circleNavBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
