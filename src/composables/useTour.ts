import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useI18n } from './useI18n'
import { useAuthStore } from '../stores/auth'

const TOUR_STORAGE_KEY_PREFIX = 'cranial_tour_completed'

function getTourKey(userId?: string): string {
  return userId ? `${TOUR_STORAGE_KEY_PREFIX}_${userId}` : TOUR_STORAGE_KEY_PREFIX
}

function cleanupMtgjsonSetCaches() {
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('mtgjson_set_')) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => { localStorage.removeItem(key) })
}

function isMobile(): boolean {
  return window.innerWidth < 768
}

export function useTour() {
  const { t } = useI18n()
  const authStore = useAuthStore()

  const isTourCompleted = (): boolean => {
    const userId = authStore.user?.id
    try {
      return localStorage.getItem(getTourKey(userId)) === 'true'
    } catch {
      return false
    }
  }

  const markTourCompleted = () => {
    const userId = authStore.user?.id
    try {
      localStorage.setItem(getTourKey(userId), 'true')
    } catch {
      // QuotaExceededError — clean up mtgjson set caches to free space and retry
      try {
        cleanupMtgjsonSetCaches()
        localStorage.setItem(getTourKey(userId), 'true')
      } catch {
        console.warn('Could not save tour completion to localStorage')
      }
    }
  }

  const skipTour = () => {
    markTourCompleted()
  }

  const resetTour = () => {
    const userId = authStore.user?.id
    try {
      localStorage.removeItem(getTourKey(userId))
    } catch {
      // ignore
    }
  }

  const openMobileMenu = (): Promise<void> => {
    return new Promise((resolve) => {
      const menuBtn = document.querySelector<HTMLButtonElement>(String.raw`.md\:hidden[class*="border-silver"]`)
      if (menuBtn && menuBtn.textContent?.trim() === '☰') {
        menuBtn.click()
        setTimeout(resolve, 300)
      } else {
        resolve()
      }
    })
  }

  const closeMobileMenu = () => {
    const menuBtn = document.querySelector<HTMLButtonElement>(String.raw`.md\:hidden[class*="border-silver"]`)
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
    resetTour,
  }
}
