/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  List,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useApiBaseUrl } from '@/features/marketing/use-api-base-url'
import { cn } from '@/lib/utils'

import { getVideoDocSections, type VideoDocSection } from './content'
import { VIDEO_DOC_PAGES, type VideoDocPageId } from './navigation'

export function VideoApiDocs(props: { page: VideoDocPageId }) {
  const { t } = useTranslation()
  const baseUrl = useApiBaseUrl()
  const hash = useLocation({ select: (location) => location.hash })
  const navigate = useNavigate()
  const scrollRoot = useRef<HTMLDivElement>(null)
  const article = useRef<HTMLElement>(null)
  const pendingChapterFocus = useRef<{
    page: VideoDocPageId
    id: string
  } | null>(null)
  const sections = getVideoDocSections(props.page, baseUrl, t)
  const firstSection = sections[0].id
  const [activeSection, setActiveSection] = useState(firstSection)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const pageIndex = VIDEO_DOC_PAGES.findIndex((page) => page.id === props.page)
  const page = VIDEO_DOC_PAGES[pageIndex]
  const previous = VIDEO_DOC_PAGES[pageIndex - 1]
  const next = VIDEO_DOC_PAGES[pageIndex + 1]

  useEffect(() => {
    const root = scrollRoot.current
    if (!root) return
    if (hash) {
      const heading = article.current?.querySelector<HTMLElement>(
        `[id="${CSS.escape(hash)}"]`
      )
      heading?.scrollIntoView({ block: 'start' })
    } else {
      root.scrollTop = 0
    }
    setOutlineOpen(false)
  }, [props.page, hash])

  useEffect(() => {
    const target = pendingChapterFocus.current
    if (!target) return
    if (target.page !== props.page) {
      pendingChapterFocus.current = null
      return
    }
    if (outlineOpen || hash !== target.id) return

    pendingChapterFocus.current = null
    const heading = article.current?.querySelector<HTMLElement>(
      `[id="${CSS.escape(target.id)}"]`
    )
    heading?.scrollIntoView({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }, [props.page, hash, outlineOpen])

  useEffect(() => {
    const root = scrollRoot.current
    const headings = [
      ...(article.current?.querySelectorAll<HTMLElement>('h2[id]') ?? []),
    ]
    if (!root) return
    let frame = 0
    const updateOutline = () => {
      const top = root.getBoundingClientRect().top + 96
      let current = firstSection
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top > top) break
        current = heading.id
      }
      if (
        root.scrollHeight > root.clientHeight &&
        root.scrollTop + root.clientHeight >= root.scrollHeight - 2
      ) {
        current = headings.at(-1)?.id ?? firstSection
      }
      setActiveSection(current)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateOutline)
    }
    updateOutline()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [props.page, firstSection])

  const selectSection = (id: string) => {
    if (hash === id) {
      article.current
        ?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'start' })
      setOutlineOpen(false)
      return
    }
    void navigate({ hash: id, resetScroll: false })
  }

  return (
    <Main>
      <div
        ref={scrollRoot}
        className='min-h-0 flex-1 overflow-y-auto overscroll-contain'
        data-testid='video-doc-scroll'
      >
        <div className='mx-auto grid w-full max-w-[90rem] min-w-0 gap-12 px-4 py-6 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1fr)_14rem] xl:px-10'>
          <article ref={article} className='mx-auto w-full max-w-3xl min-w-0'>
            <div className='text-muted-foreground mb-6 flex items-center gap-2 text-xs'>
              <BookOpen className='size-4' aria-hidden='true' />
              <Link
                to='/docs/video/$page'
                params={{ page: 'overview' }}
                className='hover:text-foreground'
              >
                {t('Documentation')}
              </Link>
              <span aria-hidden='true'>/</span>
              <span>{t('Video generation')}</span>
            </div>
            <header className='mb-8 border-b pb-8'>
              <p className='text-primary mb-3 text-xs font-semibold tracking-wide'>
                {t(page.group)}
              </p>
              <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
                {t(page.title)}
              </h1>
              <p className='text-muted-foreground mt-4 leading-7'>
                {t('Create, track and download videos with one API.')}
              </p>
            </header>

            <Collapsible
              open={outlineOpen}
              onOpenChange={setOutlineOpen}
              className='mb-8 rounded-lg border xl:hidden'
            >
              <CollapsibleTrigger className='flex w-full items-center gap-2 p-3 text-left text-sm font-medium'>
                <List className='size-4' aria-hidden='true' />
                {t('On this page')}
                <ChevronDown className='ml-auto size-4' aria-hidden='true' />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <DocumentOutline
                  sections={sections}
                  active={activeSection}
                  onSelect={(id) => {
                    pendingChapterFocus.current = { page: props.page, id }
                    selectSection(id)
                  }}
                />
              </CollapsibleContent>
            </Collapsible>

            <div className='space-y-12'>
              {sections.map((section) => (
                <section
                  key={section.id}
                  aria-labelledby={section.id}
                  className='min-w-0'
                >
                  <h2
                    id={section.id}
                    tabIndex={-1}
                    className='mb-5 scroll-mt-6 text-xl font-semibold tracking-tight outline-none'
                  >
                    {section.title}
                  </h2>
                  <div className='space-y-5 text-sm leading-7 [&_p]:text-pretty [&_p]:break-words'>
                    {section.content}
                  </div>
                </section>
              ))}
            </div>

            <nav
              aria-label={t('Document navigation')}
              className='mt-12 grid grid-cols-2 gap-3 border-t pt-6 pb-8'
            >
              {previous ? (
                <Button
                  variant='outline'
                  className='h-auto min-w-0 justify-start py-3'
                  render={
                    <Link
                      to='/docs/video/$page'
                      params={{ page: previous.id }}
                    />
                  }
                >
                  <ArrowLeft className='shrink-0' aria-hidden='true' />
                  <span className='min-w-0 text-left whitespace-normal'>
                    <span className='text-muted-foreground block text-xs'>
                      {t('Previous')}
                    </span>
                    {t(previous.title)}
                  </span>
                </Button>
              ) : (
                <div />
              )}
              {next && (
                <Button
                  variant='outline'
                  className='h-auto min-w-0 justify-end py-3'
                  render={
                    <Link to='/docs/video/$page' params={{ page: next.id }} />
                  }
                >
                  <span className='min-w-0 text-right whitespace-normal'>
                    <span className='text-muted-foreground block text-xs'>
                      {t('Next')}
                    </span>
                    {t(next.title)}
                  </span>
                  <ArrowRight className='shrink-0' aria-hidden='true' />
                </Button>
              )}
            </nav>
          </article>
          <aside className='sticky top-8 hidden max-h-[calc(100svh-8rem)] self-start overflow-y-auto border-l xl:block'>
            <p className='mb-3 px-4 text-xs font-semibold'>
              {t('On this page')}
            </p>
            <DocumentOutline
              sections={sections}
              active={activeSection}
              onSelect={selectSection}
            />
          </aside>
        </div>
      </div>
    </Main>
  )
}

function DocumentOutline(props: {
  sections: VideoDocSection[]
  active: string
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('On this page')}
      className='flex flex-col gap-1 px-3 pb-3'
    >
      {props.sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          aria-current={props.active === section.id ? 'location' : undefined}
          className={cn(
            'rounded-md px-2 py-1.5 text-xs leading-5 transition-colors hover:bg-muted focus-visible:outline-ring',
            props.active === section.id
              ? 'text-primary bg-primary/5 font-medium'
              : 'text-muted-foreground'
          )}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return
            }
            event.preventDefault()
            props.onSelect(section.id)
          }}
        >
          {section.title}
        </a>
      ))}
    </nav>
  )
}
