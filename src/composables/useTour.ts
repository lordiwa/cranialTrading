import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useI18n } from './useI18n'

const TOUR_STORAGE_KEY = 'cranial_tour_completed'

function isMobile(): boolean {
  return window.innerWidth < 768
}

export function useTour() {
  const { t } = useI18n()

  const isTourCompleted = (): boolean => {
    return localStorage.getItem(TOUR_STORAGE_KEY) === 'true'
  }

  const markTourCompleted = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true')
  }

  const skipTour = () => {
    markTourCompleted()
  }

  const openMobileMenu = (): Promise<void> => {
    return new Promise((resolve) => {
      const menuBtn = document.querySelector<HTMLButtonElement>('.md\\:hidden[class*="border-silver"]')
      if (menuBtn && menuBtn.textContent?.trim() === '☰') {
        menuBtn.click()
        setTimeout(resolve, 300)
      } else {
        resolve()
      }
    })
  }

  const closeMobileMenu = () => {
    const menuBtn = document.querySelector<HTMLButtonElement>('.md\\:hidden[class*="border-silver"]')
    if (menuBtn && menuBtn.textContent?.trim() === '✕') {
      menuBtn.click()
    }
  }

  const startTour = async () => {
    const mobile = isMobile()

    // On mobile, open hamburger first so nav elements are visible
    if (mobile) {
      await openMobileMenu()
    }

    const steps = buildSteps(mobile)

    const tourDriver = driver({
      showProgress: true,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayColor: '#000000',
      overlayOpacity: 0.75,
      stagePadding: 8,
      stageRadius: 4,
      popoverClass: 'cranial-tour-popover',
      nextBtnText: t('tour.nav.next'),
      prevBtnText: t('tour.nav.prev'),
      doneBtnText: t('tour.nav.done'),
      progressText: '{{current}} / {{total}}',
      onDestroyed: () => {
        markTourCompleted()
        if (mobile) {
          closeMobileMenu()
        }
      },
    })

    tourDriver.setSteps(steps)
    tourDriver.drive()
  }

  const buildSteps = (mobile: boolean) => {
    const steps = []

    // Step 1: Collection nav
    if (mobile) {
      const mobileCollectionLink = document.querySelector('nav[aria-label="Mobile navigation"] a[href="/collection"]')
      if (mobileCollectionLink) {
        steps.push({
          element: 'nav[aria-label="Mobile navigation"] a[href="/collection"]',
          popover: {
            title: t('tour.steps.collection.title'),
            description: t('tour.steps.collection.description'),
            side: 'bottom' as const,
          },
        })
      }
    } else {
      steps.push({
        element: '[data-tour="nav-collection"]',
        popover: {
          title: t('tour.steps.collection.title'),
          description: t('tour.steps.collection.description'),
          side: 'bottom' as const,
        },
      })
    }

    // Step 2: Status filters
    steps.push({
      element: '[data-tour="status-filters"]',
      popover: {
        title: t('tour.steps.statuses.title'),
        description: t('tour.steps.statuses.description'),
        side: 'bottom' as const,
      },
    })

    // Step 3: Add a card
    if (mobile) {
      steps.push({
        element: '[data-tour="fab-add-card"]',
        popover: {
          title: t('tour.steps.addCard.title'),
          description: t('tour.steps.addCard.description'),
          side: 'top' as const,
        },
        onHighlightStarted: () => {
          closeMobileMenu()
        },
      })
    } else {
      steps.push({
        element: '[data-tour="add-card-btn"]',
        popover: {
          title: t('tour.steps.addCard.title'),
          description: t('tour.steps.addCard.description'),
          side: 'bottom' as const,
        },
      })
    }

    // Step 4: Decks tab
    steps.push({
      element: '[data-tour="deck-tab"]',
      popover: {
        title: t('tour.steps.decks.title'),
        description: t('tour.steps.decks.description'),
        side: 'bottom' as const,
      },
      onHighlightStarted: () => {
        if (mobile) {
          closeMobileMenu()
        }
      },
    })

    // Step 5: Matches nav
    if (mobile) {
      steps.push({
        element: 'nav[aria-label="Mobile navigation"] a[href="/saved-matches"]',
        popover: {
          title: t('tour.steps.matches.title'),
          description: t('tour.steps.matches.description'),
          side: 'bottom' as const,
        },
        onHighlightStarted: async () => {
          await openMobileMenu()
        },
      })
    } else {
      steps.push({
        element: '[data-tour="nav-matches"]',
        popover: {
          title: t('tour.steps.matches.title'),
          description: t('tour.steps.matches.description'),
          side: 'bottom' as const,
        },
      })
    }

    // Step 6: Global search (desktop only)
    if (!mobile) {
      steps.push({
        element: '[data-tour="nav-search"]',
        popover: {
          title: t('tour.steps.search.title'),
          description: t('tour.steps.search.description'),
          side: 'bottom' as const,
        },
      })
    }

    return steps
  }

  return {
    isTourCompleted,
    startTour,
    skipTour,
  }
}
