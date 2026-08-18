import * as Haptics from "expo-haptics";
import React from "react";
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { AppText as Text } from "@/shared/components/ui/AppText";
import { Colors } from "@/shared/constants/theme";
import { useColorScheme } from "@/shared/hooks/useColorScheme";
import type { Resource } from "@/shared/types/domain.types";
import type { ChecklistFormState } from "@/features/details/checklist/hooks/useChecklistDetailForm";

export interface ChecklistDetailFormProps {
  form: ChecklistFormState;
  update: (patch: Partial<ChecklistFormState>) => void;
  addItem: () => void;
  setNewItemText: (text: string) => void;
  deleteItem: (id: string) => void;
  renameItem: (id: string, text: string) => void;
  moveItemUp: (index: number) => void;
  moveItemDown: (index: number) => void;
  toggleResource: (resId: string) => void;
  currentWorkspace: { name: string; emoji?: string };
  linkedResources: Resource[];
  onOpenWorkspacePicker: () => void;
  onOpenLinkPicker: () => void;
}

/**
 * Edit-mode form for a Checklist. Owns the checklist-specific editors: title /
 * description inputs, workspace dropdown, the checklist items editor
 * (reorder / rename / add / remove) and the linked-resources editor. All
 * mutations are local form-state updates; persistence happens on Save via the
 * content's EntityCommandService calls.
 */
export const ChecklistDetailForm: React.FC<ChecklistDetailFormProps> = ({
  form,
  update,
  addItem,
  setNewItemText,
  deleteItem,
  renameItem,
  moveItemUp,
  moveItemDown,
  toggleResource,
  currentWorkspace,
  linkedResources,
  onOpenWorkspacePicker,
  onOpenLinkPicker,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];

  return (
    <View style={{ gap: 20, paddingBottom: 80 }}>
      {/* Title input */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          TITLE
        </Text>
        <TextInput
          style={[
            styles.textInput,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.card,
            },
          ]}
          value={form.title}
          onChangeText={(t) => update({ title: t })}
          placeholder="Checklist Title (e.g. Weekly Groceries)"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      {/* Description input */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          DESCRIPTION / NOTES
        </Text>
        <TextInput
          style={[
            styles.textInput,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.card,
              minHeight: 80,
            },
          ]}
          value={form.description}
          onChangeText={(t) => update({ description: t })}
          placeholder="Add notes or description..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Workspace Selection dropdown */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          WORKSPACE
        </Text>
        <TouchableOpacity
          onPress={onOpenWorkspacePicker}
          style={[
            styles.textInput,
            {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderColor: colors.border,
              backgroundColor: colors.card,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Select workspace"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 15 }}>
              {currentWorkspace.emoji || "📁"}
            </Text>
            <Text
              style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}
            >
              {currentWorkspace.name}
            </Text>
          </View>
          <Feather name="chevron-down" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Checklist Items Editor */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          CHECKLIST ITEMS
        </Text>

        <View style={{ gap: 8 }}>
          {form.items.map((cIt, idx) => (
            <View
              key={cIt.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                paddingHorizontal: 8,
                paddingVertical: 4,
                gap: 4,
              }}
            >
              {/* Reordering Up/Down controls */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => moveItemUp(idx)}
                  disabled={idx === 0}
                  style={{ padding: 6, opacity: idx === 0 ? 0.3 : 1 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Move item up`}
                >
                  <Feather name="chevron-up" size={16} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveItemDown(idx)}
                  disabled={idx === form.items.length - 1}
                  style={{
                    padding: 6,
                    opacity: idx === form.items.length - 1 ? 0.3 : 1,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Move item down`}
                >
                  <Feather name="chevron-down" size={16} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Inline Item Title input */}
              <TextInput
                style={{
                  flex: 1,
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: "500",
                  paddingVertical: 8,
                  paddingHorizontal: 4,
                }}
                value={cIt.title}
                onChangeText={(txt) => renameItem(cIt.id, txt)}
                placeholder="Item name..."
                placeholderTextColor={colors.textMuted}
              />

              {/* Delete Item button */}
              <TouchableOpacity
                onPress={() => deleteItem(cIt.id)}
                style={{ padding: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Delete item`}
              >
                <Feather name="trash" size={14} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add New Item row */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 12,
              paddingVertical: 4,
              marginTop: 4,
            }}
          >
            <TextInput
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 14,
                paddingVertical: 8,
              }}
              value={form.newItemText}
              onChangeText={setNewItemText}
              placeholder="Add item..."
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={addItem}
              accessibilityLabel="Add checklist item"
            />
            <TouchableOpacity
              onPress={addItem}
              style={{ padding: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Add item"
            >
              <Feather name="plus" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Resource Linking Section */}
      <View style={styles.inputWrap}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          LINKED RESOURCES
        </Text>

        <View style={{ gap: 8 }}>
          {linkedResources.map((res) => (
            <View
              key={res.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 10,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={{ fontSize: 16 }}>
                  {res.type === "link"
                    ? "🔗"
                    : (res.type as string) === "image"
                      ? "🖼"
                      : "📝"}
                </Text>
                <View>
                  <Text
                    style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}
                  >
                    {res.title}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {(res as any).collectionName || "Resource"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                  toggleResource(res.id);
                }}
                style={{ padding: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`Unlink ${res.title}`}
              >
                <Feather name="x" size={16} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Link-a-resource button (solid borders only, as before) */}
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.cardLight,
              marginTop: 4,
            }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                () => {},
              );
              onOpenLinkPicker();
            }}
            accessibilityRole="button"
            accessibilityLabel="Link a Resource List"
          >
            <Feather name="plus" size={16} color={colors.primary} />
            <Text
              style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}
            >
              Link a Resource List
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  inputWrap: { gap: 6 },
  inputLabel: { fontSize: 13, fontWeight: "700" },
  textInput: {
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
});
