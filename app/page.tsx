import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Welcome to Club Tennis</h1>
      <p className="text-stone-600">
        New here? Sign up below and a manager will review and approve your
        profile. Already a member? Log in with your email to update your
        profile, enter your availability, and respond to match invites.
      </p>
      <div className="flex gap-4">
        <Link
          href="/signup"
          className="rounded-md bg-court-green px-4 py-2 text-white hover:bg-court-green/90"
        >
          New player signup
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-stone-300 px-4 py-2 hover:bg-stone-100"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
