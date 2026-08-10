require "test_helper"

class Api::EntryLinksTest < ActionDispatch::IntegrationTest
  setup do
    @user = create_user
    sign_in_as(@user)
  end

  test "POST creates a link" do
    parent = create_bundle(created_by: @user)
    child = create_idea(created_by: @user)

    post "/api/entries/#{parent.id}/links", params: { child_id: child.id }, as: :json
    assert_response :created
    body = JSON.parse(response.body)
    assert_equal parent.id, body.dig("link", "parent_id")
    assert_equal child.id, body.dig("link", "child_id")
  end

  test "POST rejects a link that would create a cycle" do
    a = create_idea(title: "A", created_by: @user)
    b = create_idea(title: "B", created_by: @user)
    link!(parent: a, child: b)

    post "/api/entries/#{b.id}/links", params: { child_id: a.id }, as: :json
    assert_response :unprocessable_entity
  end

  test "PATCH updates position by child_id" do
    parent = create_bundle(created_by: @user)
    child = create_idea(created_by: @user)
    link!(parent: parent, child: child, position: 0)

    patch "/api/entries/#{parent.id}/links/#{child.id}", params: { position: 5 }, as: :json
    assert_response :success
    assert_equal 5, JSON.parse(response.body).dig("link", "position")
  end

  test "DELETE removes the link, not the entry" do
    parent = create_bundle(created_by: @user)
    child = create_idea(created_by: @user)
    link!(parent: parent, child: child)

    delete "/api/entries/#{parent.id}/links/#{child.id}"
    assert_response :no_content
    assert_not EntryLink.exists?(parent_id: parent.id, child_id: child.id)
    assert Entry.exists?(child.id)
  end

  test "POST reorder sets position by array order" do
    parent = create_bundle(created_by: @user)
    a = create_idea(title: "A", created_by: @user)
    b = create_idea(title: "B", created_by: @user)
    link!(parent: parent, child: a, position: 0)
    link!(parent: parent, child: b, position: 1)

    post "/api/entries/#{parent.id}/links/reorder", params: { child_ids: [b.id, a.id] }, as: :json
    assert_response :success

    assert_equal 0, EntryLink.find_by(parent: parent, child: b).position
    assert_equal 1, EntryLink.find_by(parent: parent, child: a).position
  end
end
