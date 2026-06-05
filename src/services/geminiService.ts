import { Lead } from "../types/lead";

// Backup generator for compile safety/offline fallback - strictly no fake names
export function generateBackupLead(domain: string): Lead {
  const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].split(":")[0];
  const domainParts = cleanDomain.split(".");
  const namePart = domainParts[0] || "Target Company";
  
  const companyName = namePart
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  let industry = "Technology & Business Solutions";
  const lowerDomain = cleanDomain.toLowerCase();
  if (lowerDomain.includes("tech") || lowerDomain.includes("soft") || lowerDomain.includes("digital") || lowerDomain.includes("ai")) {
    industry = "Information Technology";
  } else if (lowerDomain.includes("health") || lowerDomain.includes("med") || lowerDomain.includes("bio") || lowerDomain.includes("care")) {
    industry = "Healthcare & Pharmaceuticals";
  } else if (lowerDomain.includes("finance") || lowerDomain.includes("cap") || lowerDomain.includes("pay") || lowerDomain.includes("bank")) {
    industry = "Financial Services";
  } else if (lowerDomain.includes("law") || lowerDomain.includes("legal") || lowerDomain.includes("court")) {
    industry = "Legal Services";
  } else if (lowerDomain.includes("construct") || lowerDomain.includes("build") || lowerDomain.includes("engineer")) {
    industry = "Construction & Engineering";
  } else if (lowerDomain.includes("enter") || lowerDomain.includes("group") || lowerDomain.includes("corp")) {
    industry = "Business Conglomerate";
  }

  const hasIndianContext = lowerDomain.includes(".in") || lowerDomain.includes("india") || lowerDomain.includes("megha") || lowerDomain.includes("sharma") || lowerDomain.includes("connect");

  return {
    industry,
    companyName,
    website: cleanDomain,
    contacts: [], // No fake/fictitious name generation as per strict requirements
    generalEmail: `info@${cleanDomain}`,
    cityState: hasIndianContext ? "Mumbai, MH" : "New York, NY",
    employeeSize: "11-50 employees",
    yearFounded: "2018",
    fundingStatus: "Self-Funded",
    hiringStatus: "Actively Hiring",
    isFallbackResult: true
  };
}

export async function researchDomain(domain: string): Promise<Lead | null> {
  try {
    const response = await fetch("/api/research", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ domain })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("[Client API Error] Falling back to standard fallback generation", error);
    return generateBackupLead(domain);
  }
}
