import React, { useMemo } from "react";
import { StyleSheet,  View, Pressable, ScrollView } from "react-native";
import { AppText as Text } from "@/components/ui/AppText";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

type DayStripProps = {
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
};

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const getDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const DayStrip: React.FC<DayStripProps> = ({
  selectedDate,
  onSelectDate,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "dark"];
  const isLight = colorScheme === "light";

  const weekDays = useMemo(() => {
    const list = [];
    const current = new Date(selectedDate);
    // Find the Monday of the week containing current date
    const dayOfWeek = current.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(current);
    monday.setDate(current.getDate() + mondayOffset);

    // Generate Monday to Sunday
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      list.push({
        dateString: getDateKey(d),
        dayNum: String(d.getDate()).padStart(2, "0"),
        dayName: WEEKDAY_NAMES[d.getDay()],
        isToday: getDateKey(d) === getDateKey(new Date()),
      });
    }
    return list;
  }, [selectedDate]);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {weekDays.map((day) => {
          const isSelected = selectedDate === day.dateString;
          return (
            <Pressable
              key={day.dateString}
              onPress={() => onSelectDate(day.dateString)}
              style={({ pressed }) => [
                styles.dayCell,
                isSelected
                  ? {
                      backgroundColor: colors.primary,
                      borderColor: isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.15)",
                    }
                  : {
                      backgroundColor: isLight ? "#FFFFFF" : "rgba(255, 255, 255, 0.02)",
                      borderColor: colors.border,
                    },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text
                style={[
                  styles.dayName,
                  { color: isSelected ? "#ffffff" : colors.textMuted },
                ]}
              >
                {day.dayName}
              </Text>
              <Text
                style={[
                  styles.dayNum,
                  { color: isSelected ? "#ffffff" : colors.text },
                ]}
              >
                {day.dayNum}
              </Text>
              {day.isToday && !isSelected && (
                <View
                  style={[
                    styles.todayDot,
                    { backgroundColor: colors.primary },
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  scrollContent: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 4,
  },
  dayCell: {
    width: 48,
    height: 64,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    position: "relative",
  },
  dayName: {
    fontSize: 10,
    fontWeight: "600",
  },
  dayNum: {
    fontSize: 14,
    fontWeight: "700",
  },
  todayDot: {
    position: "absolute",
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
