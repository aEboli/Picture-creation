import Link from "next/link";

import { JobTable } from "@/components/job-table";
import { COUNTRIES, OUTPUT_LANGUAGES, PLATFORMS, RESOLUTIONS } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { getHistoryPageData } from "@/lib/server/workspace/queries";
import { getUiLanguage } from "@/lib/ui-language";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const language = await getUiLanguage();
  const {
    currentPage,
    firstPageHref,
    formValues,
    jobs,
    lastPageHref,
    nextHref,
    pageLinks,
    previousHref,
    rangeEnd,
    rangeStart,
    showLeadingEllipsis,
    showTrailingEllipsis,
    summary,
    totalPages,
  } = getHistoryPageData(params);

  return (
    <div className="stack gap-24 history-page history-page-liquid">
      <section className="panel panel-stack history-filter-panel history-panel-glass is-info">
        <form className="filter-grid" method="get">
          <input
            defaultValue={formValues.search}
            name="search"
            placeholder={language === "zh" ? "搜索图片名" : "Search image"}
          />
          <select defaultValue={formValues.platform} name="platform">
            <option value="">{language === "zh" ? "全部平台" : "All platforms"}</option>
            {PLATFORMS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label[language]}
              </option>
            ))}
          </select>
          <select defaultValue={formValues.country} name="country">
            <option value="">{language === "zh" ? "全部国家" : "All countries"}</option>
            {COUNTRIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label[language]}
              </option>
            ))}
          </select>
          <select defaultValue={formValues.marketLanguage} name="marketLanguage">
            <option value="">{language === "zh" ? "全部语言" : "All languages"}</option>
            {OUTPUT_LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label[language]}
              </option>
            ))}
          </select>
          <select defaultValue={formValues.resolution} name="resolution">
            <option value="">{language === "zh" ? "全部分辨率" : "All resolutions"}</option>
            {RESOLUTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label[language]}
              </option>
            ))}
          </select>
          <input defaultValue={formValues.dateFrom} name="dateFrom" type="date" />
          <input defaultValue={formValues.dateTo} name="dateTo" type="date" />
          <button className="primary-button" type="submit">
            {t(language, "filters")}
          </button>
        </form>
      </section>

      <section className="panel history-table-panel history-list-panel history-panel-glass">
        <div className="split-header compact history-table-header">
          <div>
            <h3>{language === "zh" ? "任务列表" : "Job breakdown"}</h3>
          </div>
          {summary.totalJobs ? (
            <div className="history-pagination-top">
              {totalPages > 1 ? (
                <Link
                  aria-disabled={currentPage <= 1}
                  className={currentPage <= 1 ? "ghost-button mini-button is-disabled" : "ghost-button mini-button"}
                  href={previousHref}
                  tabIndex={currentPage <= 1 ? -1 : undefined}
                >
                  {language === "zh" ? "上一页" : "Previous"}
                </Link>
              ) : null}
              {totalPages > 1 ? (
                <Link
                  aria-disabled={currentPage >= totalPages}
                  className={currentPage >= totalPages ? "ghost-button mini-button is-disabled" : "ghost-button mini-button"}
                  href={nextHref}
                  tabIndex={currentPage >= totalPages ? -1 : undefined}
                >
                  {language === "zh" ? "下一页" : "Next"}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        {jobs.length ? (
          <>
            <JobTable jobs={jobs} language={language} />
            {totalPages > 1 ? (
              <nav aria-label={language === "zh" ? "历史分页" : "History pagination"} className="history-pagination">
                <Link
                  aria-disabled={currentPage <= 1}
                  className={currentPage <= 1 ? "ghost-button is-disabled" : "ghost-button"}
                  href={previousHref}
                  tabIndex={currentPage <= 1 ? -1 : undefined}
                >
                  {language === "zh" ? "上一页" : "Previous"}
                </Link>
                <div className="history-pagination-pages">
                  {firstPageHref ? (
                    <Link className="ghost-button mini-button" href={firstPageHref}>
                      1
                    </Link>
                  ) : null}
                  {showLeadingEllipsis ? <span className="history-pagination-ellipsis">...</span> : null}
                  {pageLinks.map((pageLink) => (
                    <Link
                      className={pageLink.isCurrent ? "ghost-button mini-button is-active" : "ghost-button mini-button"}
                      href={pageLink.href}
                      key={pageLink.pageNumber}
                    >
                      {pageLink.pageNumber}
                    </Link>
                  ))}
                  {showTrailingEllipsis ? <span className="history-pagination-ellipsis">...</span> : null}
                  {lastPageHref ? (
                    <Link className="ghost-button mini-button" href={lastPageHref}>
                      {totalPages}
                    </Link>
                  ) : null}
                </div>
                <Link
                  aria-disabled={currentPage >= totalPages}
                  className={currentPage >= totalPages ? "ghost-button is-disabled" : "ghost-button"}
                  href={nextHref}
                  tabIndex={currentPage >= totalPages ? -1 : undefined}
                >
                  {language === "zh" ? "下一页" : "Next"}
                </Link>
              </nav>
            ) : null}
          </>
        ) : (
          <p>{t(language, "emptyJobs")}</p>
        )}
      </section>
    </div>
  );
}
