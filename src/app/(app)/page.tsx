import { redirect } from "next/navigation";
import { ChatPanel } from "@/components/chat/chat-panel";

export default function Home() {
  redirect("/library");
  return (
    <div className="flex h-full w-full flex-col">
      <ChatPanel className="h-full" />
    </div>
  );
}
