"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { markdownComponents } from "./markdown-components";
import { CompatibilityReportContent } from "./compatibility-report";
import { Button } from "~/components/ui/button";
import type { Prisma } from "@prisma/client";
import { JobPostingsDataTable } from "./job-postings-data-table";
import { createJobPostingsColumns } from "./job-postings-table-columns";
import { useRouter, usePathname } from "next/navigation";

// Use Prisma generated type with includes
type JobPosting = Prisma.JobPostingGetPayload<{
  include: {
    details: true;
    document: true;
  };
}>;

export function JobPostingsPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Determine if we're in dashboard context to route document editor correctly
  const isDashboard = pathname.startsWith("/dashboard");

  // Helper function to generate the correct document editor URL based on context
  const getDocumentEditorUrl = (params: URLSearchParams) => {
    const baseRoute = isDashboard
      ? "/dashboard/document-editor"
      : "/dashboard/document-editor";
    return `${baseRoute}?${params.toString()}`;
  };

  const [viewContent, setViewContent] = useState<{
    id: string;
    content: string;
    title: string;
  } | null>(null);
  const [compatibilityReport, setCompatibilityReport] = useState<{
    jobPostingId: string;
    jobTitle: string;
  } | null>(null);

  // Track if URL parameters have been processed to prevent infinite loops
  const processedParamsRef = useRef<string | null>(null);

  const queryClient = api.useUtils();
  const jobPostingsQuery = api.document.listJobPostings.useQuery();

  const generateResumeMutation =
    api.document.generateTailoredResume.useMutation({
      onSuccess: (result) => {
        void jobPostingsQuery.refetch();

        // Create a clickable toast that navigates to the document editor
        toast.success(result.message, {
          action: {
            label: "Open Resume",
            onClick: () => {
              // Find the job posting to get the title
              const jobPosting = jobPostings.find(
                (jp) => jp.id === result.jobPostingId,
              );
              if (jobPosting) {
                // Navigate to document editor with URL parameters
                const params = new URLSearchParams();
                params.set("jobPostingId", result.jobPostingId);
                params.set("documentType", "resume");
                params.set("jobTitle", jobPosting.title);
                router.push(getDocumentEditorUrl(params));
              }
            },
          },
          duration: 10000, // Show for 10 seconds to give user time to click
        });
      },
      onError: (error) => {
        toast.error(`Failed to generate resume: ${error.message}`);
      },
    });

  const generateCoverLetterMutation =
    api.document.generateTailoredCoverLetter.useMutation({
      onSuccess: (result: {
        success: boolean;
        message: string;
        jobPostingId: string;
      }) => {
        void jobPostingsQuery.refetch();

        // Create a clickable toast that navigates to the document editor
        toast.success(result.message, {
          action: {
            label: "Open Cover Letter",
            onClick: () => {
              // Find the job posting to get the title
              const jobPosting = jobPostings.find(
                (jp) => jp.id === result.jobPostingId,
              );
              if (jobPosting) {
                // Navigate to document editor with URL parameters
                const params = new URLSearchParams();
                params.set("jobPostingId", result.jobPostingId);
                params.set("documentType", "coverLetter");
                params.set("jobTitle", jobPosting.title);
                router.push(getDocumentEditorUrl(params));
              }
            },
          },
          duration: 10000, // Show for 10 seconds to give user time to click
        });
      },
      onError: (error) => {
        toast.error(`Failed to generate cover letter: ${error.message}`);
      },
    });

  const deleteDocumentMutation = api.document.deleteJobPostDocument.useMutation(
    {
      onSuccess: (result) => {
        void jobPostingsQuery.refetch();
        toast.success(result.message);
      },
      onError: (error) => {
        toast.error(`Failed to delete document: ${error.message}`);
      },
    },
  );

  const updateStatusMutation = api.document.updateJobPostingStatus.useMutation({
    onMutate: async (updateData: { id: string; status: string }) => {
      // Cancel any outgoing refetches
      await queryClient.document.listJobPostings.cancel();

      // Save the current state
      const previousJobPostings = jobPostingsQuery.data ?? [];

      // Optimistically update the status in the UI
      queryClient.document.listJobPostings.setData(undefined, (old) => {
        return old
          ? old.map((job) =>
              job.id === updateData.id
                ? {
                    ...job,
                    status: updateData.status === "" ? null : updateData.status,
                  }
                : job,
            )
          : [];
      });

      // Return the previous state in case we need to revert
      return { previousJobPostings };
    },
    onError: (
      err: { message: string },
      _updateData: { id: string; status: string },
      context?: { previousJobPostings: typeof jobPostings },
    ) => {
      // If the mutation fails, restore the previous job postings
      if (context?.previousJobPostings) {
        queryClient.document.listJobPostings.setData(
          undefined,
          context.previousJobPostings,
        );
      }
      toast.error(`Failed to update status: ${err.message}`);
    },
    onSettled: () => {
      // Sync with server
      void queryClient.document.listJobPostings.invalidate();
    },
  });

  const handleViewContent = (id: string, content: string, title: string) => {
    setViewContent({ id, content, title });
  };

  const handleStatusUpdate = (jobId: string, status: string) => {
    updateStatusMutation.mutate({ id: jobId, status });
  };

  const isUpdatingStatus = (jobId: string) => {
    return (
      updateStatusMutation.isPending &&
      updateStatusMutation.variables?.id === jobId
    );
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this job posting?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleCloseContent = () => {
    setViewContent(null);
  };

  const handleViewCompatibility = (jobPostingId: string, jobTitle: string) => {
    setCompatibilityReport({ jobPostingId, jobTitle });
  };

  const handleCloseCompatibility = () => {
    setCompatibilityReport(null);
  };

  const handleGenerateResume = (jobPostingId: string) => {
    generateResumeMutation.mutate({
      jobPostingId,
    });
  };

  const handleEditDocument = (
    jobPostingId: string,
    jobTitle: string,
    content: string,
    type: "resume" | "coverLetter",
  ) => {
    // Navigate to document editor with URL parameters
    const params = new URLSearchParams();
    params.set("jobPostingId", jobPostingId);
    params.set("documentType", type);
    params.set("jobTitle", jobTitle);
    router.push(getDocumentEditorUrl(params));
  };

  const handleGenerateCoverLetter = (jobPostingId: string) => {
    generateCoverLetterMutation.mutate({
      jobPostingId,
    });
  };

  const handleViewDetails = (jobPostingId: string) => {
    const detailPath = isDashboard
      ? `/dashboard/job-postings/${jobPostingId}`
      : `/dashboard/job-postings/${jobPostingId}`;
    router.push(detailPath);
  };

  const deleteMutation = api.document.deleteJobPosting.useMutation({
    onMutate: async (deleteData) => {
      // Cancel any outgoing refetches
      await queryClient.document.listJobPostings.cancel();

      // Save the current state
      const previousJobPostings = jobPostingsQuery.data ?? [];

      // Optimistically update the UI
      queryClient.document.listJobPostings.setData(undefined, (old) => {
        return old ? old.filter((job) => job.id !== deleteData.id) : [];
      });

      // Return the previous state in case we need to revert
      return { previousJobPostings };
    },
    onError: (err, _deleteData, context) => {
      // If the mutation fails, restore the previous job postings
      if (context?.previousJobPostings) {
        queryClient.document.listJobPostings.setData(
          undefined,
          context.previousJobPostings,
        );
      }
      toast.error(`Failed to delete job posting: ${err.message}`);
    },
    onSettled: (data, error) => {
      // Sync with server
      void queryClient.document.listJobPostings.invalidate();

      // Show success toast if no error
      if (!error) {
        toast.success("Job posting deleted successfully");
      }
    },
  });

  // Handle URL parameters for automatic actions
  useEffect(() => {
    const action = searchParams.get("action");
    const jobId = searchParams.get("jobId");

    // Create a unique key for these parameters
    const paramsKey = action && jobId ? `${action}:${jobId}` : null;

    // Skip if no parameters or if we've already processed these exact parameters
    if (!paramsKey || processedParamsRef.current === paramsKey) {
      return;
    }

    if (jobPostingsQuery.data) {
      const jobPosting = jobPostingsQuery.data.find((jp) => jp.id === jobId);

      if (jobPosting && jobId) {
        // Mark these parameters as processed
        processedParamsRef.current = paramsKey;

        switch (action) {
          case "compatibility":
            console.log(
              "🔍 DEBUG: Auto-triggering compatibility report for job:",
              jobPosting.title,
            );
            setCompatibilityReport({
              jobPostingId: jobId,
              jobTitle: jobPosting.title,
            });
            break;
          case "generate-resume":
            console.log(
              "🔍 DEBUG: Auto-triggering resume generation for job:",
              jobPosting.title,
            );
            generateResumeMutation.mutate({ jobPostingId: jobId });
            break;
          case "generate-cover-letter":
            console.log(
              "🔍 DEBUG: Auto-triggering cover letter generation for job:",
              jobPosting.title,
            );
            generateCoverLetterMutation.mutate({ jobPostingId: jobId });
            break;
          default:
            console.warn("Unknown action parameter:", action);
        }

        // Clear URL parameters after handling them
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("action");
        newUrl.searchParams.delete("jobId");
        router.replace(newUrl.pathname + newUrl.search);
      } else {
        console.warn("Job posting not found for ID:", jobId);
        toast.error("Job posting not found");
      }
    }
  }, [
    searchParams,
    jobPostingsQuery.data,
    router,
    generateResumeMutation,
    generateCoverLetterMutation,
  ]);

  if (jobPostingsQuery.isLoading) {
    return <div className="p-4 text-center">Loading your job postings...</div>;
  }

  if (jobPostingsQuery.error) {
    return (
      <div className="p-4 text-center text-red-500">
        Error loading job postings: {jobPostingsQuery.error.message}
      </div>
    );
  }

  const jobPostings = jobPostingsQuery.data ?? [];

  // Show compatibility report if one is selected
  if (compatibilityReport) {
    return (
      <CompatibilityReportContent
        jobPostingId={compatibilityReport.jobPostingId}
        jobTitle={compatibilityReport.jobTitle}
        onBack={handleCloseCompatibility}
      />
    );
  }

  return (
    <div className="h-full space-y-4">
      {/* Content View Modal */}
      {viewContent && (
        <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black">
          <div className="max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-lg font-semibold">{viewContent.title}</h3>
              <Button variant="outline" onClick={handleCloseContent}>
                Close
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  components={markdownComponents}
                  rehypePlugins={[rehypeRaw]}
                >
                  {viewContent.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Postings List */}
      {jobPostings.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <svg
              className="h-8 w-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-8 0V6a2 2 0 00-2 2v6.341"
              />
            </svg>
          </div>
          <p className="font-medium text-gray-600">No job postings found</p>
          <p className="mt-1 text-sm text-gray-500">
            Add a job posting to start tracking your applications.
          </p>
        </div>
      ) : (
        <JobPostingsDataTable
          columns={createJobPostingsColumns(
            (_job: JobPosting) => {
              // Edit functionality disabled - job postings must be re-parsed with AI
              return;
            },
            handleDelete,
            handleViewContent,
            handleViewCompatibility,
            handleGenerateResume,
            handleGenerateCoverLetter,
            handleEditDocument,
            (jobPostingId: string) =>
              generateResumeMutation.isPending &&
              generateResumeMutation.variables?.jobPostingId === jobPostingId,
            (jobPostingId: string) =>
              generateCoverLetterMutation.isPending &&
              generateCoverLetterMutation.variables?.jobPostingId ===
                jobPostingId,
            deleteMutation.isPending,
            handleStatusUpdate,
            isUpdatingStatus,
            handleViewDetails,
          )}
          data={jobPostings}
          isGeneratingResume={(jobPostingId: string) =>
            generateResumeMutation.isPending &&
            generateResumeMutation.variables?.jobPostingId === jobPostingId
          }
          onJobPostingAdded={() => void jobPostingsQuery.refetch()}
        />
      )}
    </div>
  );
}
