import type { Metadata } from "next";
export const metadata: Metadata = {
    title: "Team & Collaboration — RankMaster Pro",
    description: "Manage team members, assign roles (admin/editor/writer/viewer), and collaborate on content.",
};
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
