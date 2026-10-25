import React from "react";
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from "react-native";
import { create, act } from "react-test-renderer";
import { AppText, AppTextInput } from "../AppText";

describe("AppText Typography Weight Resolution", () => {
  it("resolves default / 400 / regular weight to Outfit_400Regular", () => {
    let renderer: any;
    act(() => {
      renderer = create(<AppText>Default Text</AppText>);
    });
    const rnText = renderer.root.findByType(RNText);
    const flattened = StyleSheet.flatten(rnText.props.style);
    expect(flattened.fontFamily).toBe("Outfit_400Regular");
    expect(flattened.fontWeight).toBeUndefined();

    act(() => {
      renderer = create(<AppText style={{ fontWeight: "400" }}>400 Text</AppText>);
    });
    const rnText400 = renderer.root.findByType(RNText);
    const flattened400 = StyleSheet.flatten(rnText400.props.style);
    expect(flattened400.fontFamily).toBe("Outfit_400Regular");
    expect(flattened400.fontWeight).toBeUndefined();
  });

  it("resolves 500 / medium weight to Outfit_500Medium", () => {
    let renderer: any;
    act(() => {
      renderer = create(<AppText style={{ fontWeight: "500" }}>500 Text</AppText>);
    });
    const rnText500 = renderer.root.findByType(RNText);
    const flattened500 = StyleSheet.flatten(rnText500.props.style);
    expect(flattened500.fontFamily).toBe("Outfit_500Medium");
    expect(flattened500.fontWeight).toBeUndefined();

    act(() => {
      renderer = create(<AppText style={{ fontWeight: "medium" }}>Medium Text</AppText>);
    });
    const rnTextMedium = renderer.root.findByType(RNText);
    const flattenedMedium = StyleSheet.flatten(rnTextMedium.props.style);
    expect(flattenedMedium.fontFamily).toBe("Outfit_500Medium");
    expect(flattenedMedium.fontWeight).toBeUndefined();
  });

  it("resolves 600 / semibold weight to Outfit_600SemiBold", () => {
    let renderer: any;
    act(() => {
      renderer = create(<AppText style={{ fontWeight: "600" }}>600 Text</AppText>);
    });
    const rnText600 = renderer.root.findByType(RNText);
    const flattened600 = StyleSheet.flatten(rnText600.props.style);
    expect(flattened600.fontFamily).toBe("Outfit_600SemiBold");
    expect(flattened600.fontWeight).toBeUndefined();

    act(() => {
      renderer = create(<AppText style={{ fontWeight: "semibold" }}>SemiBold Text</AppText>);
    });
    const rnTextSemi = renderer.root.findByType(RNText);
    const flattenedSemi = StyleSheet.flatten(rnTextSemi.props.style);
    expect(flattenedSemi.fontFamily).toBe("Outfit_600SemiBold");
    expect(flattenedSemi.fontWeight).toBeUndefined();
  });

  it("resolves 700 / bold weight to Outfit_700Bold", () => {
    let renderer: any;
    act(() => {
      renderer = create(<AppText style={{ fontWeight: "700" }}>700 Text</AppText>);
    });
    const rnText700 = renderer.root.findByType(RNText);
    const flattened700 = StyleSheet.flatten(rnText700.props.style);
    expect(flattened700.fontFamily).toBe("Outfit_700Bold");
    expect(flattened700.fontWeight).toBeUndefined();

    act(() => {
      renderer = create(<AppText style={{ fontWeight: "bold" }}>Bold Text</AppText>);
    });
    const rnTextBold = renderer.root.findByType(RNText);
    const flattenedBold = StyleSheet.flatten(rnTextBold.props.style);
    expect(flattenedBold.fontFamily).toBe("Outfit_700Bold");
    expect(flattenedBold.fontWeight).toBeUndefined();
  });

  it("resolves 800 / heavy weight to Outfit_700Bold and NEVER Outfit_400Regular", () => {
    let renderer: any;
    act(() => {
      renderer = create(<AppText style={{ fontWeight: "800" }}>800 Headline</AppText>);
    });
    const rnText800 = renderer.root.findByType(RNText);
    const flattened800 = StyleSheet.flatten(rnText800.props.style);
    expect(flattened800.fontFamily).toBe("Outfit_700Bold");
    expect(flattened800.fontFamily).not.toBe("Outfit_400Regular");
    expect(flattened800.fontWeight).toBeUndefined();

    act(() => {
      renderer = create(<AppText style={{ fontWeight: "heavy" }}>Heavy Headline</AppText>);
    });
    const rnTextHeavy = renderer.root.findByType(RNText);
    const flattenedHeavy = StyleSheet.flatten(rnTextHeavy.props.style);
    expect(flattenedHeavy.fontFamily).toBe("Outfit_700Bold");
    expect(flattenedHeavy.fontFamily).not.toBe("Outfit_400Regular");
    expect(flattenedHeavy.fontWeight).toBeUndefined();
  });

  it("resolves 900 / black weight to Outfit_700Bold and NEVER Outfit_400Regular", () => {
    let renderer: any;
    act(() => {
      renderer = create(<AppText style={{ fontWeight: "900" }}>900 Milestone</AppText>);
    });
    const rnText900 = renderer.root.findByType(RNText);
    const flattened900 = StyleSheet.flatten(rnText900.props.style);
    expect(flattened900.fontFamily).toBe("Outfit_700Bold");
    expect(flattened900.fontFamily).not.toBe("Outfit_400Regular");
    expect(flattened900.fontWeight).toBeUndefined();

    act(() => {
      renderer = create(<AppText style={{ fontWeight: "black" }}>Black Milestone</AppText>);
    });
    const rnTextBlack = renderer.root.findByType(RNText);
    const flattenedBlack = StyleSheet.flatten(rnTextBlack.props.style);
    expect(flattenedBlack.fontFamily).toBe("Outfit_700Bold");
    expect(flattenedBlack.fontFamily).not.toBe("Outfit_400Regular");
    expect(flattenedBlack.fontWeight).toBeUndefined();
  });

  it("preserves explicit custom fontFamily when supplied in style", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <AppText style={{ fontFamily: "SpaceMono", fontSize: 14 }}>
          Monospace Code
        </AppText>
      );
    });
    const rnText = renderer.root.findByType(RNText);
    const flattened = StyleSheet.flatten(rnText.props.style);
    expect(flattened.fontFamily).toBe("SpaceMono");
    expect(flattened.fontSize).toBe(14);
    expect(flattened.fontWeight).toBeUndefined();
  });

  it("sanitizes fontWeight to prevent Android synthetic font glitching while setting Outfit font", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <AppText style={{ fontWeight: "800", color: "#E4E4E7", fontSize: 24 }}>
          Heavy Title
        </AppText>
      );
    });
    const rnText = renderer.root.findByType(RNText);
    const flattened = StyleSheet.flatten(rnText.props.style);
    expect(flattened.fontFamily).toBe("Outfit_700Bold");
    expect(flattened.fontWeight).toBeUndefined();
    expect(flattened.color).toBe("#E4E4E7");
    expect(flattened.fontSize).toBe(24);
  });

  it("handles AppTextInput with identical weight resolution and sanitization", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        <AppTextInput style={{ fontWeight: "800", fontSize: 16 }} value="Input text" />
      );
    });
    const rnInput = renderer.root.findByType(RNTextInput);
    const flattened = StyleSheet.flatten(rnInput.props.style);
    expect(flattened.fontFamily).toBe("Outfit_700Bold");
    expect(flattened.fontWeight).toBeUndefined();
    expect(flattened.fontSize).toBe(16);
  });
});
