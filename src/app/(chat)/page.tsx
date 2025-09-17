import { ChatPanel } from "@/components/chat/chat-panel";

export default function Home() {
  return (
    <div className="flex h-full w-full flex-col">
      <ChatPanel className="h-full" />
    </div>
  );
}

