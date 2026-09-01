module Api
  module Admin
    # A stable address for one screenshot, for places a signed bucket URL cannot
    # live. The serializer hands the admin screen a URL that dies in fifteen
    # minutes, and that is right there: the page loads, the pictures load, and
    # a leaked link is soon worthless. A CSV export is a different object -- it
    # gets saved, dropped into a backlog folder and opened days later -- so a
    # link inside it has to still work then, and a link that works for days
    # must not *be* the authorization. This route is that link: it lives
    # behind the same two doors as everything else under /api/admin (session
    # or bearer token, see Admin::BaseController), and only once the caller is
    # through does it mint a fresh short-lived URL and redirect to it. The
    # export prints these; nothing else needs to, since the admin screen's
    # response is consumed within the life of its own signed URLs.
    #
    # allow_other_host because with R2 the redirect leaves this host for the
    # bucket's; with the Disk service it is a route on this host, and the flag
    # is simply unneeded. curl drops an Authorization header when a redirect
    # crosses hosts, which is exactly what a presigned S3 URL wants -- so
    # `curl -L -H "Authorization: Bearer ..."` on one of these links works
    # against either service.
    class ScreenshotsController < Api::Admin::BaseController
      def show
        feedback = policy_scope([:admin, Feedback]).find(params[:feedback_id])
        authorize [:admin, feedback], :read?

        # Scoped to this feedback's own attachments, so an attachment id
        # paired with the wrong feedback id is a 404 and not a picture.
        attachment = feedback.screenshots_attachments.find(params[:id])
        redirect_to attachment.blob.url(expires_in: 15.minutes), allow_other_host: true
      end
    end
  end
end
