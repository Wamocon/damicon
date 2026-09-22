import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { knopfKlassen } from "@/components/ui/kit";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="text-center">
        <p className="text-5xl font-black text-primary">404</p>
        <p className="mt-3 text-sm text-muted-foreground">{t("message")}</p>
        <Link
          href="/"
          className={knopfKlassen({
            rundung: "pille",
            groesse: "mittel",
            className: "mt-6 px-5 font-semibold",
          })}
        >
          {t("home")}
        </Link>
      </div>
    </div>
  );
}
