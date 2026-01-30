'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface HomeCTAButtonProps {
  isSignedIn: boolean;
}

export function HomeCTAButton({ isSignedIn }: HomeCTAButtonProps) {
  return (
    <Link href={isSignedIn ? "/dashboard" : "/sign-in"}>
      <Button
        variant="outline"
        className="text-2xl bg-gray-900 text-white rounded-full py-5 px-12"
      >
        {isSignedIn ? "Go to Dashboard" : "SignIn"}
        <ArrowRight className="ml-2 h-5 w-5 mr-2" />
      </Button>
    </Link>
  );
}
