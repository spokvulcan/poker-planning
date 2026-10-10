"use client";

import { Suspense } from "react";
import { SigninForm } from "@/components/auth/signin-form";
import { AuthPageLayout } from "@/components/auth/auth-page-layout";

function SigninPageContent() {
  return (
    <AuthPageLayout>
      <SigninForm />
    </AuthPageLayout>
  );
}

export default function SigninPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-background" />}>
      <SigninPageContent />
    </Suspense>
  );
}
