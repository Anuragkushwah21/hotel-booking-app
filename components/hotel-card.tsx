import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Star } from 'lucide-react'

interface HotelCardProps {
  id: string
  name: string
  location: string
  rating: number
  totalReviews: number
  imageUrl: string | null
  pricePerNight?: number
}

export function HotelCard({
  id,
  name,
  location,
  rating,
  totalReviews,
  imageUrl,
  pricePerNight,
}: HotelCardProps) {
  return (
    <Link href={`/hotels/${id}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer h-full">
        <div className="relative h-48 bg-muted overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover hover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/10">
              <span className="text-4xl">🏨</span>
            </div>
          )}
        </div>

        <div className="p-4">
          <h3 className="font-semibold text-lg text-foreground mb-1 line-clamp-1">
            {name}
          </h3>

          <p className="text-sm text-foreground/70 mb-3">
            {location}
          </p>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1">
              <Star size={16} className="fill-primary text-primary" />
              <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
            </div>
            <span className="text-sm text-foreground/60">
              ({totalReviews} reviews)
            </span>
          </div>

          {pricePerNight && (
            <div className="pt-3 border-t border-border">
              <p className="text-primary font-bold text-lg">
                ${pricePerNight}
                <span className="text-sm text-foreground/70 font-normal"> per night</span>
              </p>
            </div>
          )}
        </div>
      </Card>
    </Link>
  )
}
