import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="mb-8 text-center font-display text-4xl font-semibold text-brand-mostaza">
          Criollitas OS
        </h1>
        <LoginForm />
      </div>
    </main>
  );
}
