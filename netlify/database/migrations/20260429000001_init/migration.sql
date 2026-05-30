-- ReelVault initial schema

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  credits INTEGER NOT NULL DEFAULT 5,
  monthly_downloads_used INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reels (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  niche TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT NOT NULL,
  video_url TEXT NOT NULL,
  suggested_caption TEXT NOT NULL DEFAULT '',
  suggested_hashtags TEXT NOT NULL DEFAULT '',
  trending_score INTEGER NOT NULL DEFAULT 50,
  credit_cost INTEGER NOT NULL DEFAULT 1,
  is_premium BOOLEAN NOT NULL DEFAULT FALSE,
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reels_niche ON reels(niche);
CREATE INDEX IF NOT EXISTS idx_reels_created_at ON reels(created_at DESC);

CREATE TABLE IF NOT EXISTS unlocks (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  credits_spent INTEGER NOT NULL DEFAULT 0,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, reel_id)
);

CREATE INDEX IF NOT EXISTS idx_unlocks_user ON unlocks(user_id);

CREATE TABLE IF NOT EXISTS schedules (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  reel_id INTEGER NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  platforms TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id, scheduled_for DESC);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id, created_at DESC);

INSERT INTO reels (title, niche, description, thumbnail_url, video_url, suggested_caption, suggested_hashtags, trending_score, credit_cost, is_premium, duration_seconds) VALUES
  ('Morning Money Mindset', 'money', 'A 30-second hook on building wealthy daily habits.', 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-counting-money-1572/1080p.mp4', 'The first 30 minutes of your day decide your bank account. Save this.', '#moneymindset #entrepreneur #motivation #wealth', 92, 1, false, 28),
  ('Luxury Lifestyle Edit', 'luxury', 'Cinematic luxury b-roll over a viral hook.', 'https://images.unsplash.com/photo-1542293787938-c9e299b88019?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-luxury-watch-1572/1080p.mp4', 'They told you it was impossible. They were broke.', '#luxury #mindset #motivation #success', 88, 2, true, 25),
  ('AI Side Hustle in 60s', 'ai', 'Fastest growing AI hustle explained in a hook + payoff.', 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-typing-on-a-laptop-1583/1080p.mp4', '3 AI tools that print $100/day in 2026. Bookmark this.', '#ai #sidehustle #passiveincome #chatgpt', 96, 2, true, 35),
  ('Gym Discipline Reel', 'fitness', 'Aesthetic gym cuts with a discipline voiceover.', 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-bodybuilder-2484/1080p.mp4', 'Discipline beats motivation 10 times out of 10.', '#gymmotivation #discipline #fitness #grindset', 81, 1, false, 22),
  ('Affordable Luxury Cars', 'cars', 'POV walkaround of trending used luxury cars.', 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-car-driving-on-the-highway-1572/1080p.mp4', '5 used luxury cars under $30k that look like $100k.', '#cars #luxurycars #carsoftiktok #fyp', 84, 1, false, 30),
  ('Quote of the Day', 'motivation', 'Animated quote reel with cinematic background.', 'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-sunset-time-lapse-1572/1080p.mp4', 'Save this for the day you almost quit.', '#motivation #quotes #mindset #inspiration', 70, 1, false, 18),
  ('Aesthetic Food Hook', 'food', 'Trending plating shot with a hook caption.', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-cooking-pasta-1572/1080p.mp4', '$3 dinner that tastes like a $30 restaurant plate.', '#foodtiktok #recipe #foodie #cheapeats', 78, 1, false, 24),
  ('Real Estate Closer', 'realestate', 'Realtor closing a luxury home tour.', 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-modern-luxury-house-2484/1080p.mp4', 'How I bought my first rental property at 23.', '#realestate #wealthbuilding #realtor #money', 89, 2, true, 33),
  ('Productivity Hook', 'business', 'Desk timelapse with a productivity hook.', 'https://images.unsplash.com/photo-1483058712412-4245e9b90334?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-typing-on-laptop-2484/1080p.mp4', 'The 4-hour workday system that 7-figure CEOs swear by.', '#productivity #ceo #business #entrepreneur', 86, 1, false, 27),
  ('Trending Meme Hook', 'memes', 'Viral meme cutaway template ready to remix.', 'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-laughing-with-friends-2484/1080p.mp4', 'Tell me you''re Gen Z without telling me.', '#memes #fyp #funny #relatable', 75, 1, false, 15),
  ('Crypto Wealth Hook', 'money', 'Charts and a confident voiceover.', 'https://images.unsplash.com/photo-1518544801976-3e188ea7f49a?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-bitcoin-on-a-laptop-2484/1080p.mp4', 'The next 18 months will create more millionaires than the last decade.', '#crypto #bitcoin #investing #wealth', 90, 2, true, 30),
  ('Faith & Mindset Reel', 'motivation', 'Cinematic landscape with reflective voiceover.', 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=70', 'https://cdn.coverr.co/videos/coverr-mountain-sunset-1572/1080p.mp4', 'The version of you in 12 months is begging you to start today.', '#mindset #faith #motivation #grindset', 79, 1, false, 22);
