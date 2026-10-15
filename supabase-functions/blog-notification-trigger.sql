-- Blog Post Push Notification Trigger
-- Uses pg_net to call the Supabase Edge Function when a blog post is published
-- URL: https://oxwhqvsoelqqsblmqkxx.supabase.co/functions/v1/send-blog-notification
-- Auth: x-webhook-secret header with BLOG_WEBHOOK_SECRET
-- IMPORTANT: Replace <BLOG_WEBHOOK_SECRET> below with the actual secret value before executing

CREATE OR REPLACE FUNCTION public.notify_new_blog_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'published' THEN
    PERFORM net.http_post(
      url := 'https://oxwhqvsoelqqsblmqkxx.supabase.co/functions/v1/send-blog-notification',
      body := json_build_object(
        'record', json_build_object(
          'id', NEW.id::text,
          'title', NEW.title,
          'slug', NEW.slug,
          'meta_description', COALESCE(NEW.meta_description, ''),
          'featured_image_url', NEW.featured_image_url,
          'status', NEW.status
        )
      )::jsonb,
      headers := json_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', '<BLOG_WEBHOOK_SECRET>'
      )::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_blog_post_inserted ON public.blog_posts;
CREATE TRIGGER on_blog_post_inserted
  AFTER INSERT ON public.blog_posts
  FOR EACH ROW
  WHEN (NEW.status = 'published')
  EXECUTE FUNCTION public.notify_new_blog_post();

DROP TRIGGER IF EXISTS on_blog_post_published ON public.blog_posts;
CREATE TRIGGER on_blog_post_published
  AFTER UPDATE ON public.blog_posts
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'published' AND NEW.status = 'published')
  EXECUTE FUNCTION public.notify_new_blog_post();
