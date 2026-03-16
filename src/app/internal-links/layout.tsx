import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Internal Links — RankMaster Pro",
    description: "Analyze existing WordPress posts, discover internal linking opportunities, and apply AI-suggested links in bulk.",
};

export default function InternalLinksLayout({ children }: { children: React.ReactNode }) {
    return children;
}
