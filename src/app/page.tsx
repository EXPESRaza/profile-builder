import { ProfileBuilder } from "@/components/ProfileBuilder";

export default function Home() {
  return (
    <main className="mx-auto flex h-screen w-full max-w-6xl flex-col gap-3 p-4">
      <header className="flex items-baseline justify-between px-1">
        <h1 className="text-lg font-semibold">Profile Builder</h1>
        <p className="text-xs text-neutral-500">
          Chat about how you travel; your profile builds itself on the right.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <ProfileBuilder />
      </div>
    </main>
  );
}
