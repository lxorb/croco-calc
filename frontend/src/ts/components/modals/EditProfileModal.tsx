import {
  GithubProfileSchema,
  TwitterProfileSchema,
  UserProfileDetailsSchema,
  WebsiteSchema,
} from "@croco-calc/schemas/users";
import { createForm } from "@tanstack/solid-form";
import { JSXElement } from "solid-js";

import Ape from "../../ape";
import { getSnapshot, setSnapshot } from "../../db";
import { invalidateMyProfile } from "../../queries/profile";
import { hideModal } from "../../states/modals";
import {
  showErrorNotification,
  showSuccessNotification,
} from "../../states/notifications";
import { AnimatedModal } from "../common/AnimatedModal";
import { Checkbox } from "../ui/form/Checkbox";
import { InputField } from "../ui/form/InputField";
import { SubmitButton } from "../ui/form/SubmitButton";
import { TextareaField } from "../ui/form/TextareaField";
import { fromSchema } from "../ui/form/utils";

/**
 * AC-052: the profile details are `bio` and the three social profiles only —
 * the upstream `keyboard` field is removed. C16 removes badges, so the badge
 * picker goes with them. AC-158: the public-activity toggle lives here.
 */
export function EditProfile(): JSXElement {
  const snapshot = getSnapshot();
  if (snapshot === undefined) {
    throw new Error("missing snapshot in EditProfile");
  }
  const form = createForm(() => ({
    defaultValues: {
      bio: snapshot.details?.bio ?? "",
      github: snapshot.details?.socialProfiles?.github ?? "",
      twitter: snapshot.details?.socialProfiles?.twitter ?? "",
      website: snapshot.details?.socialProfiles?.website ?? "",
      showActivityOnPublicProfile:
        snapshot.details?.showActivityOnPublicProfile ?? true,
    },
    onSubmit: async ({ value }) => {
      const updates = {
        bio: value.bio,
        socialProfiles: {
          twitter: value.twitter ?? "",
          github: value.github ?? "",
          website: value.website ?? "",
        },
        showActivityOnPublicProfile: value.showActivityOnPublicProfile,
      };

      const response = await Ape.users.updateProfile({ body: updates });

      if (response.status !== 200) {
        showErrorNotification("Failed to update profile", { response });
        return;
      }

      form.reset(value);
      hideModal("EditProfile");
      setSnapshot({
        ...snapshot,
        details: response.body.data ?? updates,
      });
      void invalidateMyProfile();
      showSuccessNotification("Profile updated");
    },
  }));

  return (
    <AnimatedModal
      id="EditProfile"
      title="Edit Profile"
      modalClass="max-w-[600px]"
    >
      <form
        class="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div>
          <label class="mb-[0.25em] block text-sub">name</label>
          <div>
            To update your name, go to Account Settings &gt; Account &gt; Update
            account name
          </div>
        </div>

        <div>
          <label class="mb-[0.25em] block text-sub">bio</label>
          <form.Field
            name="bio"
            validators={{
              onChange: fromSchema(UserProfileDetailsSchema.shape.bio),
            }}
          >
            {(field) => (
              <>
                <TextareaField field={field} maxLength={250} />
                <div class="mt-1 text-base">
                  {field().state.value.length}/250
                </div>
              </>
            )}
          </form.Field>
        </div>

        <div>
          <label class="mb-[0.25em] block text-sub">github</label>
          <div class="flex items-center">
            <p class="my-2 mr-2">https://github.com/</p>
            <div class="w-full max-w-60">
              <form.Field
                name="github"
                validators={{
                  onChange: fromSchema(GithubProfileSchema),
                }}
              >
                {(field) => (
                  <InputField
                    field={field}
                    class="github"
                    type="text"
                    maxLength={39}
                  />
                )}
              </form.Field>
            </div>
          </div>
        </div>

        <div>
          <label class="mb-[0.25em] block text-sub">twitter</label>
          <div class="flex items-center">
            <p class="my-2 mr-2">https://x.com/</p>
            <div class="w-full max-w-60">
              <form.Field
                name="twitter"
                validators={{
                  onChange: fromSchema(TwitterProfileSchema),
                }}
              >
                {(field) => (
                  <InputField
                    field={field}
                    class="twitter"
                    type="text"
                    maxLength={15}
                  />
                )}
              </form.Field>
            </div>
          </div>
        </div>

        <div>
          <label class="mb-[0.25em] block text-sub">website</label>
          <form.Field
            name="website"
            validators={{
              onChange: fromSchema(WebsiteSchema),
            }}
          >
            {(field) => (
              <InputField
                field={field}
                class="website"
                type="text"
                maxLength={200}
              />
            )}
          </form.Field>
        </div>

        <div>
          <label class="mb-[0.25em] block text-sub">public activity</label>
          <form.Field name="showActivityOnPublicProfile">
            {(field) => (
              <Checkbox
                field={field}
                label="Include test activity graph on your public profile."
              />
            )}
          </form.Field>
        </div>

        <SubmitButton form={form}>save</SubmitButton>
      </form>
    </AnimatedModal>
  );
}
