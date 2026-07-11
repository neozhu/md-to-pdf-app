"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  REVIEW_PROFILE_LIMITS,
  type ReviewProfile,
  type ReviewProfileInput,
} from "@/lib/review-profiles";
import {
  createReviewProfile,
  deleteReviewProfile,
  updateReviewProfile,
} from "@/lib/review-profiles-api";

type ReviewProfileManagerProps = {
  profiles: ReviewProfile[];
  onProfilesChange: (profiles: ReviewProfile[]) => void;
  onSelectionCleared: (profileId: string) => void;
  onClose: () => void;
};

const EMPTY_FORM: ReviewProfileInput = {
  name: "",
  description: "",
  reviewerGuidance: "",
  editorGuidance: "",
};

function sortProfiles(profiles: ReviewProfile[]) {
  return [...profiles].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function ReviewProfileManager({
  profiles,
  onProfilesChange,
  onSelectionCleared,
  onClose,
}: ReviewProfileManagerProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<ReviewProfileInput>(EMPTY_FORM);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canSave =
    form.name.trim() &&
    form.description.trim() &&
    form.reviewerGuidance.trim() &&
    form.editorGuidance.trim();

  function beginAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setIsEditing(true);
  }

  function beginEdit(profile: ReviewProfile) {
    setEditingId(profile.id);
    setForm({
      name: profile.name,
      description: profile.description,
      reviewerGuidance: profile.reviewerGuidance,
      editorGuidance: profile.editorGuidance,
    });
    setError(null);
    setIsEditing(true);
  }

  function updateField(field: keyof ReviewProfileInput, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || isSaving) return;

    setIsSaving(true);
    setError(null);
    try {
      if (editingId) {
        const updated = await updateReviewProfile(editingId, form);
        onProfilesChange(
          sortProfiles(
            profiles.map((profile) =>
              profile.id === updated.id ? updated : profile,
            ),
          ),
        );
      } else {
        const created = await createReviewProfile(form);
        onProfilesChange(sortProfiles([...profiles, created]));
      }
      setIsEditing(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save review profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeProfile(profile: ReviewProfile) {
    if (!window.confirm(`Delete "${profile.name}"?`)) return;

    setError(null);
    try {
      await deleteReviewProfile(profile.id);
      onProfilesChange(profiles.filter((item) => item.id !== profile.id));
      onSelectionCleared(profile.id);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete review profile.",
      );
    }
  }

  return (
    <Card className="space-y-3 border p-3 shadow-none">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Manage Profiles</h3>
          <p className="text-[11px] text-muted-foreground">
            Profiles are shared across this personal deployment.
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Close profile manager"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      {!isEditing ? (
        <>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {profiles.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-muted-foreground">
                No review profiles yet.
              </p>
            ) : (
              profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{profile.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {profile.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => beginEdit(profile)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeProfile(profile)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <Button type="button" size="sm" onClick={beginAdd}>
            <Plus className="size-4" />
            Add Profile
          </Button>
        </>
      ) : (
        <form className="space-y-3" onSubmit={saveProfile}>
          <ProfileField
            id="profile-name"
            label="Profile Name"
            helper='Use a short document type, such as "Technical Documentation."'
          >
            <Input
              id="profile-name"
              value={form.name}
              maxLength={REVIEW_PROFILE_LIMITS.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Technical Documentation"
            />
          </ProfileField>

          <ProfileField
            id="profile-description"
            label="Description"
            helper="Explain which documents this Profile fits and its main focus."
          >
            <Input
              id="profile-description"
              value={form.description}
              maxLength={REVIEW_PROFILE_LIMITS.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              placeholder="Review technical documents for accuracy and step order."
            />
          </ProfileField>

          <ProfileField
            id="profile-reviewer-guidance"
            label="Reviewer Guidance"
            helper="Tell the Reviewer which problems to inspect, including priorities and issues it should not report."
          >
            <textarea
              id="profile-reviewer-guidance"
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.reviewerGuidance}
              maxLength={REVIEW_PROFILE_LIMITS.reviewerGuidance}
              onChange={(event) =>
                updateField("reviewerGuidance", event.target.value)
              }
              placeholder={"Review this document for [target audience].\n\nPrioritize:\n- [highest-impact issue]\n\nDo not:\n- [low-value issue]"}
            />
          </ProfileField>

          <ProfileField
            id="profile-editor-guidance"
            label="Editor Guidance"
            helper="Tell the Editor how to apply an approved review, including what to preserve and what it may change."
          >
            <textarea
              id="profile-editor-guidance"
              className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={form.editorGuidance}
              maxLength={REVIEW_PROFILE_LIMITS.editorGuidance}
              onChange={(event) =>
                updateField("editorGuidance", event.target.value)
              }
              placeholder={"When applying the approved review:\n\nPreserve:\n- [facts or constraints]\n\nOnly change:\n- [allowed edits]"}
            />
          </ProfileField>

          {error ? <p className="text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!canSave || isSaving}>
              {isSaving ? "Saving…" : editingId ? "Save Changes" : "Add Profile"}
            </Button>
          </div>
        </form>
      )}

      {error && !isEditing ? <p className="text-destructive">{error}</p> : null}
    </Card>
  );
}

function ProfileField({
  id,
  label,
  helper,
  children,
}: {
  id: string;
  label: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children}
      <p className="text-[11px] text-muted-foreground">{helper}</p>
    </div>
  );
}
