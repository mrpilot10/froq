const KEY = "froq-demo-customers";

export interface DemoShopMember {
  slug: string;
  name: string;
  phone: string;
  businessName: string;
  rewardTitle: string;
  rewardName: string;
  totalStamps: number;
  brandColor: string;
  logoUrl: string | null;
}

function readAll(): DemoShopMember[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DemoShopMember[];
  } catch {
    return [];
  }
}

function writeAll(members: DemoShopMember[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(members));
}

export function readDemoShopMember(slug: string): DemoShopMember | null {
  return readAll().find((m) => m.slug === slug) ?? null;
}

export function isDemoShopMember(slug: string): boolean {
  return readDemoShopMember(slug) !== null;
}

export function writeDemoShopMember(member: DemoShopMember) {
  const rest = readAll().filter((m) => m.slug !== member.slug);
  writeAll([...rest, member]);
}

export function clearDemoShopMember(slug: string) {
  writeAll(readAll().filter((m) => m.slug !== slug));
}
