import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Typography } from "@/constants/typography";

import { AppCard } from "./AppCard";

type TaskList = { id: string; name: string };

interface ListManagerProps {
  lists: TaskList[];
  selectedList: string;
  todos: Record<string, { completed: boolean }[]>;
  onSelectList: (id: string) => void;
  onDeleteCurrentList: () => void;
  onCreateList: (name: string) => void;
  onRenameList: (id: string, newName: string) => void;
  listsExpanded: boolean;
  setListsExpanded: (expanded: boolean) => void;
  colors: any;
  colorScheme: "light" | "dark" | null;
}

const getListColors = (name: string, isSelected: boolean) => {
  const lowercase = name.toLowerCase();
  let bg = isSelected ? "#dbeafe" : "rgba(59, 130, 246, 0.08)";
  let text = isSelected ? "#1e3a8a" : "#3B82F6";
  let icon: any = "list";

  if (lowercase.includes("work")) {
    bg = isSelected ? "#dbeafe" : "rgba(59, 130, 246, 0.08)";
    text = isSelected ? "#1e3a8a" : "#3B82F6";
    icon = "briefcase";
  } else if (lowercase.includes("personal") || lowercase.includes("garden")) {
    bg = isSelected ? "#d1fae5" : "rgba(16, 185, 129, 0.08)";
    text = isSelected ? "#064e3b" : "#10B981";
    icon = "user";
  } else if (lowercase.includes("habit")) {
    bg = isSelected ? "#ffedd5" : "rgba(245, 158, 11, 0.08)";
    text = isSelected ? "#7c2d12" : "#F59E0B";
    icon = "activity";
  } else if (lowercase.includes("focus")) {
    bg = isSelected ? "#f3e8ff" : "rgba(168, 85, 247, 0.08)";
    text = isSelected ? "#581c87" : "#A855F7";
    icon = "clock";
  } else {
    bg = isSelected ? "#f1f5f9" : "rgba(100, 116, 139, 0.08)";
    text = isSelected ? "#334155" : "#64748B";
    icon = "grid";
  }

  return { bg, text, icon };
};

export function ListManager({
  lists,
  selectedList,
  todos,
  onSelectList,
  onDeleteCurrentList,
  onCreateList,
  onRenameList,
  listsExpanded,
  setListsExpanded,
  colors,
  colorScheme,
}: ListManagerProps) {
  const [newListName, setNewListName] = useState("");
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingListName, setEditingListName] = useState("");

  const handleCreate = () => {
    const trimmed = newListName.trim();
    if (!trimmed) return;
    onCreateList(trimmed);
    setNewListName("");
  };

  const startRename = (listId: string, currentName: string) => {
    setEditingListId(listId);
    setEditingListName(currentName);
  };

  const handleSaveRename = () => {
    const trimmed = editingListName.trim();
    if (trimmed && editingListId) {
      onRenameList(editingListId, trimmed);
    }
    setEditingListId(null);
  };

  return (
    <AppCard style={styles.listManager}>
      <Pressable
        onPress={() => setListsExpanded(!listsExpanded)}
        style={styles.listHeaderRow}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Lists
          </Text>
          <View
            style={{
              backgroundColor:
                colorScheme === "light"
                  ? "rgba(99, 102, 241, 0.08)"
                  : "rgba(99, 102, 241, 0.15)",
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                color: colors.primary,
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {lists.find((l) => l.id === selectedList)?.name ?? "My Tasks"}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {listsExpanded && (
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onDeleteCurrentList();
              }}
              disabled={lists.length <= 1}
            >
              <Text
                style={{
                  color: lists.length <= 1 ? colors.textMuted : colors.error,
                  fontSize: Typography.sizes.sm,
                  fontWeight: "600",
                }}
              >
                Delete current
              </Text>
            </Pressable>
          )}
          <Feather
            name={listsExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textMuted}
          />
        </View>
      </Pressable>

      {listsExpanded && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listPills}
          >
            {lists.map((list) => {
              const isSelected = list.id === selectedList;
              const isEditing = editingListId === list.id;

              if (isEditing) {
                return (
                  <View
                    key={list.id}
                    style={[
                      styles.listPill,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        backgroundColor: "rgba(255,255,255,0.04)",
                        borderColor: colors.primary,
                      },
                    ]}
                  >
                    <TextInput
                      value={editingListName}
                      onChangeText={setEditingListName}
                      onSubmitEditing={handleSaveRename}
                      onBlur={handleSaveRename}
                      autoFocus
                      style={{
                        color: colors.text,
                        fontSize: Typography.sizes.sm,
                        fontWeight: "600",
                        padding: 0,
                        margin: 0,
                        minWidth: 70,
                      }}
                    />
                    <Pressable onPress={handleSaveRename} hitSlop={6}>
                      <Feather name="check" size={14} color={colors.success} />
                    </Pressable>
                  </View>
                );
              }

              const listTodos = todos[list.id] ?? [];
              const count = listTodos.filter((t) => !t.completed).length;
              const { bg, text, icon } = getListColors(list.name, isSelected);

              return (
                <Pressable
                  key={list.id}
                  onPress={() => onSelectList(list.id)}
                  onLongPress={() => startRename(list.id, list.name)}
                  delayLongPress={400}
                  style={[
                    styles.listPill,
                    {
                      backgroundColor: bg,
                      borderColor: isSelected
                        ? text
                        : "rgba(255, 255, 255, 0.05)",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    },
                  ]}
                >
                  <Feather name={icon} size={13} color={text} />
                  <Text
                    style={{
                      color: text,
                      fontWeight: "700",
                      fontSize: Typography.sizes.sm,
                    }}
                  >
                    {list.name}
                  </Text>
                  <View
                    style={{
                      backgroundColor: isSelected
                        ? "rgba(0, 0, 0, 0.15)"
                        : "rgba(255, 255, 255, 0.08)",
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      borderRadius: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: text,
                      }}
                    >
                      {count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={[styles.createListRow, { borderColor: colors.border }]}>
            <TextInput
              value={newListName}
              onChangeText={setNewListName}
              placeholder="Create new list"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={handleCreate}
              style={[styles.createListInput, { color: colors.text }]}
            />
            <Pressable
              onPress={handleCreate}
              style={[styles.smallAddBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="plus" size={16} color="#ffffff" />
            </Pressable>
          </View>
        </>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  listManager: {
    padding: 12,
    gap: 12,
  },
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: Typography.sizes.md,
    fontWeight: "700",
  },
  listPills: {
    gap: 8,
    paddingVertical: 4,
  },
  listPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
  },
  createListRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 8,
  },
  createListInput: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    paddingVertical: 6,
  },
  smallAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
