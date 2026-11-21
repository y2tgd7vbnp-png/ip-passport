/**
 * 许可规则引擎（需求第 9 节）：SPDX → CommercialPolicy / 义务清单 / 风险等级 / 商业授权提示。
 * 规则放在 rules.json，便于法务后续修改。
 */
import rulesData from "./rules.json" with { type: "json" };

export type CommercialPolicy =
  | "UNSPECIFIED"
  | "PERMISSIVE"
  | "WEAK_COPYLEFT"
  | "STRONG_COPYLEFT"
  | "NETWORK_COPYLEFT"
  | "NONCOMMERCIAL"
  | "SOURCE_AVAILABLE"
  | "PROPRIETARY";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type NeedsCommercialLicense = "NO" | "LIKELY" | "CHECK_TERMS";

export type LicenseAdvice = {
  spdx: string;
  policy: CommercialPolicy;
  riskLevel: RiskLevel;
  obligations: string[];
  obligationsEn: string[];
  needsCommercialLicense: NeedsCommercialLicense;
  disclaimer: string;
};

type RuleEntry = {
  spdx: string;
  aliases?: string[];
  policy: CommercialPolicy;
  riskLevel: RiskLevel;
  obligations: string[];
  obligationsEn: string[];
  needsCommercialLicense: NeedsCommercialLicense;
};

type RulesFile = {
  version: number;
  disclaimer: string;
  disclaimerEn: string;
  unspecified: Omit<RuleEntry, "spdx" | "aliases">;
  rules: RuleEntry[];
};

const RULES = rulesData as RulesFile;

/** SPDX（或别名）→ 建议。无匹配 → UNSPECIFIED 规则。 */
export function adviceFor(spdx: string | null | undefined, hasTermsHash = false): LicenseAdvice {
  if (hasTermsHash && (!spdx || spdx === "NOASSERTION")) {
    // 作者登记了自定义条款（termsHash 存在）
    return {
      spdx: spdx ?? "CUSTOM",
      policy: "PROPRIETARY",
      riskLevel: "HIGH",
      obligations: ["按作者登记的条款执行"],
      obligationsEn: ["Follow the terms registered by the author"],
      needsCommercialLicense: "CHECK_TERMS",
      disclaimer: RULES.disclaimer,
    };
  }
  const key = (spdx ?? "").trim();
  if (!key || key === "NOASSERTION") {
    return {
      spdx: key || "NOASSERTION",
      ...RULES.unspecified,
      obligations: [...RULES.unspecified.obligations],
      obligationsEn: [...RULES.unspecified.obligationsEn],
      disclaimer: RULES.disclaimer,
    };
  }
  const hit = RULES.rules.find((r) => r.spdx === key || r.aliases?.includes(key));
  if (!hit) {
    return {
      spdx: key,
      ...RULES.unspecified,
      obligations: [`未识别的许可标识 ${key}，请人工核对条款`],
      obligationsEn: [`Unrecognised SPDX identifier ${key}; review the terms manually`],
      disclaimer: RULES.disclaimer,
    };
  }
  return {
    spdx: hit.spdx,
    policy: hit.policy,
    riskLevel: hit.riskLevel,
    obligations: [...hit.obligations],
    obligationsEn: [...hit.obligationsEn],
    needsCommercialLicense: hit.needsCommercialLicense,
    disclaimer: RULES.disclaimer,
  };
}

export const DISCLAIMER = RULES.disclaimer;
export const DISCLAIMER_EN = RULES.disclaimerEn;
