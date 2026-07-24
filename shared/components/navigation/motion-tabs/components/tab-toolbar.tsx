import {
  type ComponentProps,
  type FC,
  type FunctionComponent,
  type JSX,
  memo,
  type ReactElement,
  type ReactNode,
} from "react";
import { Pressable, View } from "react-native";

import type { ITabToolbarProps } from "../typings/motion-tabs";
import { layoutStyles as styles } from "../utils/layout-styles";
import { MorphTab } from "./morph-tab";

const TabToolbar: FC<ITabToolbarProps> & FunctionComponent<ITabToolbarProps> =
  memo<ITabToolbarProps & ComponentProps<typeof TabToolbar>>(
    ({
      colors,
      items,
      onLayout,
      onPress,
      view,
    }: ITabToolbarProps & ComponentProps<typeof TabToolbar>):
      | (ReactNode & ReactElement & JSX.Element)
      | null => {
      return (
        <View style={styles.toolbarRow} onLayout={onLayout}>
          {items.map((item, index) => {
            if (item.routeName === "daily") {
              return (
                <View key={item.key} style={{ justifyContent: "center", alignItems: "center", marginHorizontal: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add Task"
                    onPress={() => onPress(item, index)}
                    style={({ pressed }) => [
                      {
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: colors.accent,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.85 : 1,
                        transform: [{ scale: pressed ? 0.95 : 1 }],
                        elevation: 4,
                        shadowColor: colors.accent,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 6,
                      }
                    ]}
                  >
                    {item.icon(false, "#FFFFFF", 24)}
                  </Pressable>
                </View>
              );
            }
            return (
              <MorphTab
                key={item.key}
                active={view === item.key}
                colors={colors}
                item={item}
                onPress={() => onPress(item, index)}
              />
            );
          })}
        </View>
      );
    },
  );

export { TabToolbar };

